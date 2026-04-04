import pytest
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'notification-service'))

from unittest.mock import patch, MagicMock


@pytest.fixture
def client():
    os.environ['RABBITMQ_URL'] = 'amqp://guest:guest@localhost:5672'
    os.environ['REDIS_URL'] = 'redis://localhost:6379'
    with patch('app.redis_client', None):
        from app import app
        app.config['TESTING'] = True
        with app.test_client() as c:
            yield c


class TestNotificationService:
    def test_health(self, client):
        response = client.get('/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
        assert data['service'] == 'notification-service'

    def test_get_notifications_empty(self, client):
        response = client.get('/api/notifications/nonexistent-user')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'notifications' in data

    def test_metrics_endpoint(self, client):
        response = client.get('/metrics')
        assert response.status_code == 200
