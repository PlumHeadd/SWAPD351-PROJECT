import os
import json
from datetime import datetime
from flask import Flask, request, jsonify
from pymongo import MongoClient
from bson import ObjectId
import redis
import pika
import pybreaker
import jwt as pyjwt
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/eventify_events')
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
RABBITMQ_URL = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
JWT_SECRET = os.getenv('JWT_SECRET', 'eventify_jwt_secret_key_2026')
PORT = int(os.getenv('PORT', 5001))

# MongoDB
mongo_client = MongoClient(MONGO_URI)
db = mongo_client.get_default_database()
events_col = db['events']
rsvps_col = db['rsvps']

# Redis
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except:
    redis_client = None

# RabbitMQ
rabbitmq_connection = None
rabbitmq_channel = None

def get_rabbitmq_channel():
    global rabbitmq_connection, rabbitmq_channel
    try:
        if rabbitmq_connection is None or rabbitmq_connection.is_closed:
            params = pika.URLParameters(RABBITMQ_URL)
            rabbitmq_connection = pika.BlockingConnection(params)
            rabbitmq_channel = rabbitmq_connection.channel()
            rabbitmq_channel.exchange_declare(exchange='eventify.events', exchange_type='topic', durable=True)
        return rabbitmq_channel
    except:
        return None

# Circuit breaker
breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=30)

# Prometheus
request_counter = Counter('event_service_requests_total', 'Total requests', ['method', 'endpoint', 'status'])

def serialize_event(event):
    if event is None:
        return None
    event['id'] = str(event.pop('_id'))
    if 'date' in event and isinstance(event['date'], datetime):
        event['date'] = event['date'].isoformat()
    if 'created_at' in event and isinstance(event['created_at'], datetime):
        event['created_at'] = event['created_at'].isoformat()
    if 'updated_at' in event and isinstance(event['updated_at'], datetime):
        event['updated_at'] = event['updated_at'].isoformat()
    return event

def get_user_id():
    user_id = request.headers.get('x-user-id')
    if not user_id:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            try:
                decoded = pyjwt.decode(auth.split(' ')[1], JWT_SECRET, algorithms=['HS256'])
                user_id = decoded.get('id')
            except:
                pass
    return user_id

def publish_message(routing_key, data):
    try:
        ch = get_rabbitmq_channel()
        if ch:
            ch.basic_publish(
                exchange='eventify.events',
                routing_key=routing_key,
                body=json.dumps(data, default=str),
                properties=pika.BasicProperties(delivery_mode=2)
            )
    except:
        pass

def cache_get(key):
    if redis_client:
        try:
            val = breaker.call(redis_client.get, key)
            return json.loads(val) if val else None
        except:
            return None
    return None

def cache_set(key, value, ttl=300):
    if redis_client:
        try:
            breaker.call(redis_client.setex, key, ttl, json.dumps(value, default=str))
        except:
            pass

def cache_delete(pattern):
    if redis_client:
        try:
            for k in redis_client.scan_iter(pattern):
                redis_client.delete(k)
        except:
            pass

@app.after_request
def count_request(response):
    request_counter.labels(method=request.method, endpoint=request.path, status=response.status_code).inc()
    return response

@app.route('/health')
def health():
    return jsonify(status='ok', service='event-service')

@app.route('/metrics')
def metrics():
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}

# ---- EVENT CRUD ----

@app.route('/api/events', methods=['GET'])
def list_events():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    skip = (page - 1) * limit

    query = {}
    category = request.args.get('category')
    search = request.args.get('search')
    if category:
        query['category'] = category
    if search:
        query['title'] = {'$regex': search, '$options': 'i'}

    cache_key = f"events:list:{page}:{limit}:{category}:{search}"
    cached = cache_get(cache_key)
    if cached:
        return jsonify(cached)

    total = events_col.count_documents(query)
    events = list(events_col.find(query).sort('date', -1).skip(skip).limit(limit))
    events = [serialize_event(e) for e in events]

    result = {'events': events, 'total': total, 'page': page, 'pages': (total + limit - 1) // limit}
    cache_set(cache_key, result)
    return jsonify(result)

@app.route('/api/events', methods=['POST'])
def create_event():
    user_id = get_user_id()
    if not user_id:
        return jsonify(error='Authentication required'), 401

    data = request.get_json()
    if not data or not data.get('title') or not data.get('date') or not data.get('location'):
        return jsonify(error='title, date, location required'), 400

    event = {
        'title': data['title'],
        'description': data.get('description', ''),
        'date': data['date'],
        'location': data['location'],
        'category': data.get('category', 'other'),
        'max_capacity': int(data.get('max_capacity', 100)),
        'current_attendees': 0,
        'creator_id': user_id,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }

    result = events_col.insert_one(event)
    event['_id'] = result.inserted_id
    serialized = serialize_event(event)

    cache_delete('events:list:*')
    publish_message('event.created', serialized)

    return jsonify(serialized), 201

@app.route('/api/events/<event_id>', methods=['GET'])
def get_event(event_id):
    cache_key = f"events:detail:{event_id}"
    cached = cache_get(cache_key)
    if cached:
        return jsonify(cached)

    try:
        event = events_col.find_one({'_id': ObjectId(event_id)})
    except:
        return jsonify(error='Invalid event ID'), 400

    if not event:
        return jsonify(error='Event not found'), 404

    serialized = serialize_event(event)
    cache_set(cache_key, serialized)
    return jsonify(serialized)

@app.route('/api/events/<event_id>', methods=['PUT'])
def update_event(event_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify(error='Authentication required'), 401

    try:
        event = events_col.find_one({'_id': ObjectId(event_id)})
    except:
        return jsonify(error='Invalid event ID'), 400

    if not event:
        return jsonify(error='Event not found'), 404
    if event['creator_id'] != user_id:
        return jsonify(error='Forbidden'), 403

    data = request.get_json()
    update_fields = {}
    for field in ['title', 'description', 'date', 'location', 'category', 'max_capacity']:
        if field in data:
            update_fields[field] = data[field]
    update_fields['updated_at'] = datetime.utcnow()

    events_col.update_one({'_id': ObjectId(event_id)}, {'$set': update_fields})

    updated = events_col.find_one({'_id': ObjectId(event_id)})
    serialized = serialize_event(updated)

    cache_delete(f'events:detail:{event_id}')
    cache_delete('events:list:*')
    publish_message('event.updated', serialized)

    return jsonify(serialized)

@app.route('/api/events/<event_id>', methods=['DELETE'])
def delete_event(event_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify(error='Authentication required'), 401

    try:
        event = events_col.find_one({'_id': ObjectId(event_id)})
    except:
        return jsonify(error='Invalid event ID'), 400

    if not event:
        return jsonify(error='Event not found'), 404
    if event['creator_id'] != user_id:
        return jsonify(error='Forbidden'), 403

    events_col.delete_one({'_id': ObjectId(event_id)})
    rsvps_col.delete_many({'event_id': event_id})

    cache_delete(f'events:detail:{event_id}')
    cache_delete('events:list:*')
    publish_message('event.deleted', {'id': event_id})

    return '', 204

# ---- RSVP ----

@app.route('/api/events/<event_id>/rsvp', methods=['POST'])
def rsvp_event(event_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify(error='Authentication required'), 401

    try:
        event = events_col.find_one({'_id': ObjectId(event_id)})
    except:
        return jsonify(error='Invalid event ID'), 400

    if not event:
        return jsonify(error='Event not found'), 404

    existing = rsvps_col.find_one({'event_id': event_id, 'user_id': user_id})
    if existing:
        return jsonify(error='Already RSVP\'d'), 400

    if event.get('current_attendees', 0) >= event.get('max_capacity', 100):
        return jsonify(error='Event is full'), 400

    rsvps_col.insert_one({
        'event_id': event_id,
        'user_id': user_id,
        'rsvp_date': datetime.utcnow()
    })

    events_col.update_one({'_id': ObjectId(event_id)}, {'$inc': {'current_attendees': 1}})

    cache_delete(f'events:detail:{event_id}')
    publish_message('rsvp.created', {'event_id': event_id, 'user_id': user_id, 'event_title': event.get('title', '')})

    return jsonify(message='RSVP confirmed'), 201

@app.route('/api/events/<event_id>/rsvp', methods=['DELETE'])
def cancel_rsvp(event_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify(error='Authentication required'), 401

    result = rsvps_col.delete_one({'event_id': event_id, 'user_id': user_id})
    if result.deleted_count == 0:
        return jsonify(error='RSVP not found'), 404

    event = events_col.find_one({'_id': ObjectId(event_id)})
    event_title = event.get('title', '') if event else ''
    events_col.update_one({'_id': ObjectId(event_id)}, {'$inc': {'current_attendees': -1}})

    cache_delete(f'events:detail:{event_id}')
    publish_message('rsvp.cancelled', {'event_id': event_id, 'user_id': user_id, 'event_title': event_title})

    return '', 204

@app.route('/api/events/<event_id>/attendees', methods=['GET'])
def list_attendees(event_id):
    rsvps = list(rsvps_col.find({'event_id': event_id}))
    attendees = []
    for r in rsvps:
        attendees.append({
            'user_id': r['user_id'],
            'rsvp_date': r['rsvp_date'].isoformat() if isinstance(r['rsvp_date'], datetime) else str(r['rsvp_date'])
        })
    return jsonify(attendees=attendees, count=len(attendees))

# ---- STATS (for dashboard) ----

@app.route('/api/events/stats', methods=['GET'])
def event_stats():
    total_events = events_col.count_documents({})
    total_rsvps = rsvps_col.count_documents({})
    trending = list(events_col.find().sort('current_attendees', -1).limit(5))
    trending = [serialize_event(e) for e in trending]
    return jsonify(total_events=total_events, total_rsvps=total_rsvps, trending_events=trending)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False)
