import pytest
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'event-service'))

from unittest.mock import MagicMock, patch
from bson import ObjectId
from datetime import datetime


@pytest.fixture
def client():
    os.environ['MONGO_URI'] = 'mongodb://localhost:27017/test_events'
    os.environ['REDIS_URL'] = 'redis://localhost:6379'
    os.environ['RABBITMQ_URL'] = 'amqp://guest:guest@localhost:5672'
    os.environ['JWT_SECRET'] = 'test_secret'

    with patch('app.mongo_client') as mock_mongo, \
         patch('app.redis_client', None), \
         patch('app.get_rabbitmq_channel', return_value=None):
        from app import app
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        response = client.get('/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
        assert data['service'] == 'event-service'


class TestEventEndpoints:
    @patch('app.events_col')
    def test_list_events_empty(self, mock_col, client):
        mock_col.count_documents.return_value = 0
        mock_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        response = client.get('/api/events')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'events' in data
        assert data['total'] == 0

    @patch('app.events_col')
    def test_create_event_no_auth(self, mock_col, client):
        response = client.post('/api/events',
            data=json.dumps({'title': 'Test', 'date': '2026-04-01', 'location': 'ZC'}),
            content_type='application/json')
        assert response.status_code == 401

    @patch('app.events_col')
    @patch('app.get_user_id', return_value='user-123')
    def test_create_event_missing_fields(self, mock_uid, mock_col, client):
        response = client.post('/api/events',
            data=json.dumps({'title': 'Test'}),
            content_type='application/json',
            headers={'x-user-id': 'user-123'})
        assert response.status_code == 400

    @patch('app.publish_message')
    @patch('app.cache_delete')
    @patch('app.events_col')
    def test_create_event_success(self, mock_col, mock_cache, mock_pub, client):
        fake_id = ObjectId()
        mock_col.insert_one.return_value = MagicMock(inserted_id=fake_id)
        response = client.post('/api/events',
            data=json.dumps({
                'title': 'Test Event',
                'date': '2026-04-01T10:00:00',
                'location': 'Zewail City',
                'category': 'conference',
                'max_capacity': 100
            }),
            content_type='application/json',
            headers={'x-user-id': 'user-123'})
        assert response.status_code == 201

    @patch('app.events_col')
    def test_get_event_not_found(self, mock_col, client):
        mock_col.find_one.return_value = None
        response = client.get(f'/api/events/{ObjectId()}')
        assert response.status_code == 404

    def test_get_event_invalid_id(self, client):
        response = client.get('/api/events/invalid-id')
        assert response.status_code == 400


class TestRsvpEndpoints:
    @patch('app.events_col')
    def test_rsvp_no_auth(self, mock_col, client):
        response = client.post(f'/api/events/{ObjectId()}/rsvp')
        assert response.status_code == 401

    @patch('app.rsvps_col')
    @patch('app.events_col')
    def test_rsvp_event_not_found(self, mock_events, mock_rsvps, client):
        mock_events.find_one.return_value = None
        response = client.post(f'/api/events/{ObjectId()}/rsvp',
            headers={'x-user-id': 'user-123'})
        assert response.status_code == 404

    @patch('app.publish_message')
    @patch('app.cache_delete')
    @patch('app.rsvps_col')
    @patch('app.events_col')
    def test_rsvp_already_rsvped(self, mock_events, mock_rsvps, mock_cache, mock_pub, client):
        eid = ObjectId()
        mock_events.find_one.return_value = {'_id': eid, 'current_attendees': 5, 'max_capacity': 100}
        mock_rsvps.find_one.return_value = {'event_id': str(eid), 'user_id': 'user-123'}
        response = client.post(f'/api/events/{eid}/rsvp',
            headers={'x-user-id': 'user-123'})
        assert response.status_code == 400


class TestStatsEndpoint:
    @patch('app.rsvps_col')
    @patch('app.events_col')
    def test_stats_returns_data(self, mock_events, mock_rsvps, client):
        mock_events.count_documents.return_value = 10
        mock_rsvps.count_documents.return_value = 25
        mock_events.find.return_value.sort.return_value.limit.return_value = []
        response = client.get('/api/events/stats')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['total_events'] == 10
        assert data['total_rsvps'] == 25
