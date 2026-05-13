import pytest
import requests
import time
import os

# Use Docker network address by default (api-gateway:3000)
# Override with BASE_URL environment variable if needed
BASE_URL = os.getenv('BASE_URL', 'http://api-gateway:3000')

@pytest.fixture(scope='session', autouse=True)
def wait_for_services():
    """Wait for all services to be ready before running integration tests."""
    for i in range(30):
        try:
            r = requests.get(f'{BASE_URL}/health', timeout=2)
            if r.status_code == 200:
                return
        except:
            pass
        time.sleep(2)
    pytest.skip("Services not available")


class TestServiceHealth:
    def test_api_gateway_health(self):
        r = requests.get(f'{BASE_URL}/health')
        assert r.status_code == 200
        assert r.json()['status'] == 'ok'

    def test_event_service_via_gateway(self):
        r = requests.get(f'{BASE_URL}/api/events')
        assert r.status_code == 200
        data = r.json()
        assert 'events' in data


class TestEventCRUD:
    created_event_id = None

    def test_list_events(self):
        r = requests.get(f'{BASE_URL}/api/events')
        assert r.status_code == 200

    def test_create_event_unauthorized(self):
        r = requests.post(f'{BASE_URL}/api/events', json={
            'title': 'Test', 'date': '2026-04-01', 'location': 'ZC'
        })
        assert r.status_code == 401

    def test_get_nonexistent_event(self):
        r = requests.get(f'{BASE_URL}/api/events/000000000000000000000000')
        assert r.status_code == 404

    def test_event_stats(self):
        r = requests.get(f'{BASE_URL}/api/events/stats')
        assert r.status_code == 200
        data = r.json()
        assert 'total_events' in data
        assert 'total_rsvps' in data


class TestContractValidation:
    """Contract tests to ensure API response shapes match expected schemas."""

    def test_events_list_contract(self):
        r = requests.get(f'{BASE_URL}/api/events')
        data = r.json()
        assert isinstance(data.get('events'), list)
        assert isinstance(data.get('total'), int)
        assert isinstance(data.get('page'), int)

    def test_stats_contract(self):
        r = requests.get(f'{BASE_URL}/api/events/stats')
        data = r.json()
        assert 'total_events' in data
        assert 'total_rsvps' in data
        assert 'trending_events' in data
        assert isinstance(data['trending_events'], list)

    def test_health_contract(self):
        r = requests.get(f'{BASE_URL}/health')
        data = r.json()
        assert data['status'] == 'ok'
        assert 'service' in data
