import json
import pytest
from pact import Consumer, Provider

# Pact setup for User Service contracts
PACT_MOCK_PORT = 1234
pact = Consumer('EventifyUI').has_state(
    'user exists',
    upon_receiving='a request for user details'
).with_request(
    'get',
    '/api/users/me'
).will_respond_with(200, body={
    'id': 'user-uuid-123',
    'email': 'user@example.com',
    'name': 'Test User',
    'avatar_url': 'https://example.com/avatar.jpg',
    'bio': 'Test bio'
})

def test_get_user_profile(pact):
    """Contract test: API Gateway → User Service"""
    with pact:
        response = pact.get_interaction()
        assert response['status'] == 200
        assert 'id' in response['body']
        assert 'email' in response['body']

pact_auth = Consumer('EventifyUI').has_state(
    'user is authenticated',
    upon_receiving='a request for authentication with valid token'
).with_request(
    'post',
    '/api/auth/refresh',
    body={'refresh_token': 'valid-refresh-token-xyz'}
).will_respond_with(200, body={
    'access_token': 'new-access-token-abc',
    'refresh_token': 'new-refresh-token-def',
    'token_type': 'Bearer',
    'expires_in': 900
})

def test_refresh_token(pact_auth):
    """Contract test: Token refresh flow"""
    with pact_auth:
        response = pact_auth.get_interaction()
        assert response['status'] == 200
        assert 'access_token' in response['body']
        assert response['body']['token_type'] == 'Bearer'

# Event Service contracts
pact_events = Consumer('EventifyUI').has_state(
    'events exist in database',
    upon_receiving='a request to list events'
).with_request(
    'get',
    '/api/events?page=1&limit=20'
).will_respond_with(200, body={
    'events': [
        {
            'id': 'event-uuid-1',
            'title': 'Test Event',
            'description': 'Test event description',
            'date': '2026-06-01T18:00:00Z',
            'location': 'Test Location',
            'category': 'networking',
            'max_capacity': 100,
            'current_attendees': 5,
            'creator_id': 'user-uuid-123'
        }
    ],
    'total': 1,
    'page': 1,
    'pages': 1
})

def test_list_events(pact_events):
    """Contract test: Event Service list endpoint"""
    with pact_events:
        response = pact_events.get_interaction()
        assert response['status'] == 200
        assert 'events' in response['body']
        assert len(response['body']['events']) > 0
        assert 'title' in response['body']['events'][0]

# Error handling contracts
pact_error = Consumer('EventifyUI').has_state(
    'invalid token provided',
    upon_receiving='a request with invalid JWT token'
).with_request(
    'get',
    '/api/users/me',
    headers={'Authorization': 'Bearer invalid-token'}
).will_respond_with(401, body={
    'error': 'Invalid or expired token'
})

def test_invalid_token_handling(pact_error):
    """Contract test: Error handling - invalid token"""
    with pact_error:
        response = pact_error.get_interaction()
        assert response['status'] == 401
        assert 'error' in response['body']

# Authentication required contracts
pact_auth_required = Consumer('EventifyUI').has_state(
    'no authentication provided',
    upon_receiving='a request to protected endpoint without token'
).with_request(
    'post',
    '/api/events'
).will_respond_with(401, body={
    'error': 'Authentication required'
})

def test_auth_required(pact_auth_required):
    """Contract test: Authentication required for POST /api/events"""
    with pact_auth_required:
        response = pact_auth_required.get_interaction()
        assert response['status'] == 401

# Rate limiting contract
pact_ratelimit = Consumer('EventifyUI').has_state(
    'rate limit exceeded',
    upon_receiving='multiple rapid requests from same IP'
).with_request(
    'get',
    '/api/events'
).will_respond_with(429, body={
    'error': 'Too many requests'
}, headers={
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': '1234567890'
})

def test_rate_limiting(pact_ratelimit):
    """Contract test: Rate limiting response"""
    with pact_ratelimit:
        response = pact_ratelimit.get_interaction()
        assert response['status'] == 429
        assert 'X-RateLimit-Limit' in response.get('headers', {})
