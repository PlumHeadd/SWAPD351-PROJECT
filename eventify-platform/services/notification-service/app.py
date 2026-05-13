import os
import sys
import json
import threading
import smtplib
from email.mime.text import MIMEText
from flask import Flask, jsonify
import pika
import redis as redis_lib
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
import urllib.request
from metrics import (
    track_notification_send, track_redis_operation, track_rabbitmq_consume,
    track_external_api_call, track_smtp_send
)

# Force unbuffered output for Docker logs
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

app = Flask(__name__)
PORT = int(os.getenv('PORT', 5002))
RABBITMQ_URL = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
SMTP_HOST = os.getenv('SMTP_HOST', 'mailhog')
SMTP_PORT = int(os.getenv('SMTP_PORT', 1025))
SMTP_USER = os.getenv('SMTP_USER', '')
SMTP_PASS = os.getenv('SMTP_PASS', '')
SMTP_FROM = os.getenv('SMTP_FROM', 'noreply@eventify.local')
USER_SERVICE_URL = os.getenv('USER_SERVICE_URL', 'http://user-service:3001')

try:
    redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except:
    redis_client = None

notification_log = []

def get_user_email(user_id):
    """Look up user email from User Service by user ID."""
    try:
        with track_external_api_call('user-service', 'get_user'):
            url = f'{USER_SERVICE_URL}/api/users/{user_id}'
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
                return data.get('email', '')
    except Exception as e:
        print(f"Could not fetch email for user {user_id}: {e}")
        return ''

@track_notification_send('email')
def send_email(to_email, subject, body):
    if not to_email:
        print(f"⚠️  Email skipped: no recipient address")
        return
    try:
        with track_smtp_send():
            msg = MIMEText(body, 'plain', 'utf-8')
            msg['Subject'] = subject
            msg['From'] = SMTP_FROM
            msg['To'] = to_email

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.ehlo()
                # Only use TLS + auth when credentials are configured (production)
                if SMTP_USER and SMTP_PASS:
                    server.starttls()
                    server.login(SMTP_USER, SMTP_PASS)
                server.send_message(msg)

        print(f"✅ Email sent to {to_email} | subject: {subject}")
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ SMTP Auth failed: {e}")
        print(f"   → For Gmail: enable 2FA then create an App Password at")
        print(f"     https://myaccount.google.com/apppasswords")
        print(f"   → Set SMTP_USER and SMTP_PASS in backend/.env")
    except smtplib.SMTPException as e:
        print(f"❌ SMTP error sending to {to_email}: {e}")
    except Exception as e:
        print(f"❌ Unexpected error sending to {to_email}: {e}")

@track_notification_send('push')
def store_notification(user_id, message):
    notif = {'user_id': user_id, 'message': message, 'read': False}
    notification_log.append(notif)
    if redis_client:
        try:
            with track_redis_operation('lpush'):
                redis_client.lpush(f'notifications:{user_id}', json.dumps(notif))
            with track_redis_operation('ltrim'):
                redis_client.ltrim(f'notifications:{user_id}', 0, 99)
        except:
            pass

def process_message(ch, method, properties, body):
    try:
        with track_rabbitmq_consume(method.routing_key):
            data = json.loads(body)
            routing_key = method.routing_key
            print(f"Received: {routing_key} -> {data}")

            user_id = ''
            message = ''
            subject = '[Eventify] Notification'

            if routing_key == 'event.created':
                user_id = data.get('creator_id', '')
                message = f"Your event '{data.get('title', '')}' has been created successfully."
                subject = f"[Eventify] Event Created: {data.get('title', '')}"
            elif routing_key == 'event.updated':
                user_id = data.get('creator_id', '')
                message = f"Event '{data.get('title', '')}' has been updated."
                subject = f"[Eventify] Event Updated: {data.get('title', '')}"
            elif routing_key == 'event.deleted':
                user_id = data.get('creator_id', 'system')
                message = f"Your event has been deleted."
                subject = '[Eventify] Event Deleted'
            elif routing_key == 'rsvp.created':
                user_id = data.get('user_id', '')
                event_name = data.get('event_title', '') or data.get('event_id', '')
                message = f"You have RSVP'd to '{event_name}'."
                subject = f"[Eventify] RSVP Confirmed: {event_name}"
            elif routing_key == 'rsvp.cancelled':
                user_id = data.get('user_id', '')
                event_name = data.get('event_title', '') or data.get('event_id', '')
                message = f"Your RSVP to '{event_name}' has been cancelled."
                subject = f"[Eventify] RSVP Cancelled: {event_name}"
            elif routing_key == 'chat.message':
                user_id = data.get('user_id', '')
                message = f"New message from {data.get('user_name', 'someone')} in your event chat."
                subject = '[Eventify] New Chat Message'

            # Store in Redis
            store_notification(user_id, message)

            # Send email (skip chat messages to avoid spam)
            if routing_key != 'chat.message' and user_id and user_id != 'system':
                email = get_user_email(user_id)
                if email:
                    print(f"📧 Attempting to send email to {email}...")
                    send_email(email, subject, message)
                else:
                    print(f"⚠️  No email found for user_id: {user_id}")

        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f"❌ Error processing message: {e}")
        import traceback
        traceback.print_exc()
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

def start_consumer():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.exchange_declare(exchange='eventify.events', exchange_type='topic', durable=True)
            result = channel.queue_declare(queue='notification-queue', durable=True)
            queue_name = result.method.queue

            for key in ['event.*', 'rsvp.*', 'chat.*']:
                channel.queue_bind(exchange='eventify.events', queue=queue_name, routing_key=key)

            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=queue_name, on_message_callback=process_message)
            print("Notification consumer started, waiting for messages...")
            channel.start_consuming()
        except Exception as e:
            print(f"RabbitMQ connection failed: {e}, retrying in 5s...")
            import time
            time.sleep(5)

@app.route('/health')
def health():
    return jsonify(status='ok', service='notification-service')

@app.route('/metrics')
def metrics():
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}

@app.route('/api/notifications/<user_id>')
def get_notifications(user_id):
    if redis_client:
        try:
            notifs = redis_client.lrange(f'notifications:{user_id}', 0, 49)
            return jsonify(notifications=[json.loads(n) for n in notifs])
        except:
            pass
    user_notifs = [n for n in notification_log if n['user_id'] == user_id][-50:]
    return jsonify(notifications=user_notifs)

if __name__ == '__main__':
    consumer_thread = threading.Thread(target=start_consumer, daemon=True)
    consumer_thread.start()
    app.run(host='0.0.0.0', port=PORT, debug=False)
