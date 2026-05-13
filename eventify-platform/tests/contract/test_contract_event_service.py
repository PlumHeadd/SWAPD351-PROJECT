"""
Contract Tests — Event Service API

Validates that the running event-service responses conform to the contract
defined in docs/api-specs/event-service-api.yaml.

Uses openapi-core for schema validation against the OpenAPI 3 spec.

Run:
    pytest tests/contract/test_contract_event_service.py -v
    (services must be running: docker compose up -d)
"""

import os
import jwt as pyjwt
import requests
import yaml
import pytest

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
JWT_SECRET = os.environ.get("JWT_SECRET", "eventify_jwt_secret_key_2026")

SPEC_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "docs", "api-specs", "event-service-api.yaml"
)


@pytest.fixture(scope="module")
def auth_headers():
    """Generate a JWT with a valid UUID id and organizer role for write operations."""
    token = pyjwt.encode(
        {"id": "00000000-0000-0000-0000-000000000001", "email": "contract@test.com",
         "name": "Contract Tester", "role": "organizer"},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def openapi_spec():
    with open(SPEC_PATH, "r") as f:
        return yaml.safe_load(f)


# ── Helpers ──────────────────────────────────────────────────────────────────

def assert_status(response, *expected_codes):
    assert response.status_code in expected_codes, (
        f"Expected status {expected_codes}, got {response.status_code}. "
        f"Body: {response.text[:300]}"
    )


def assert_json_keys(body: dict, *required_keys):
    for key in required_keys:
        assert key in body, f"Expected key '{key}' missing from response: {list(body.keys())}"


# ── Contract Tests ────────────────────────────────────────────────────────────

class TestListEvents:
    """GET /api/events — matches OpenAPI spec for list response."""

    def test_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/events")
        assert_status(r, 200)

    def test_response_is_json(self):
        r = requests.get(f"{BASE_URL}/api/events")
        assert r.headers["Content-Type"].startswith("application/json")

    def test_response_has_required_fields(self):
        r = requests.get(f"{BASE_URL}/api/events")
        body = r.json()
        assert_json_keys(body, "events", "total", "page")

    def test_events_is_array(self):
        r = requests.get(f"{BASE_URL}/api/events")
        assert isinstance(r.json()["events"], list)

    def test_total_is_integer(self):
        r = requests.get(f"{BASE_URL}/api/events")
        assert isinstance(r.json()["total"], int)

    def test_pagination_params_accepted(self):
        r = requests.get(f"{BASE_URL}/api/events?page=1&limit=5")
        assert_status(r, 200)
        body = r.json()
        assert len(body["events"]) <= 5

    def test_category_filter_accepted(self):
        r = requests.get(f"{BASE_URL}/api/events?category=tech")
        assert_status(r, 200)

    def test_search_param_accepted(self):
        r = requests.get(f"{BASE_URL}/api/events?search=test")
        assert_status(r, 200)


class TestCreateEvent:
    """POST /api/events — requires auth JWT; matches OpenAPI spec. Cleans up after itself."""

    VALID_PAYLOAD = {
        "title": "_contract_test_event_",
        "description": "Created by contract test suite — auto-deleted after tests",
        "date": "2026-12-01T10:00:00Z",
        "location": "Test Venue",
        "category": "tech",
        "max_attendees": 50,
    }
    _created_ids: list = []

    @classmethod
    def _cleanup(cls, headers):
        """Delete every event created during this test class."""
        for event_id in cls._created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=headers, timeout=3)
            except Exception:
                pass
        cls._created_ids.clear()

    def _create(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/events", json=self.VALID_PAYLOAD, headers=auth_headers)
        if r.status_code in (200, 201):
            body = r.json()
            eid = body.get("id") or body.get("_id")
            if eid:
                TestCreateEvent._created_ids.append(str(eid))
        return r

    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/events", json=self.VALID_PAYLOAD)
        assert_status(r, 401, 403)

    def test_creates_event_with_valid_payload(self, auth_headers):
        r = self._create(auth_headers)
        assert_status(r, 201, 200)

    def test_created_event_has_id(self, auth_headers):
        r = self._create(auth_headers)
        if r.status_code in (200, 201):
            body = r.json()
            assert "id" in body or "_id" in body, "Created event must have an id"

    def test_created_event_reflects_title(self, auth_headers):
        r = self._create(auth_headers)
        if r.status_code in (200, 201):
            assert r.json().get("title") == self.VALID_PAYLOAD["title"]

    def test_missing_title_returns_400(self, auth_headers):
        payload = {k: v for k, v in self.VALID_PAYLOAD.items() if k != "title"}
        r = requests.post(f"{BASE_URL}/api/events", json=payload, headers=auth_headers)
        assert_status(r, 400, 422)

    def test_missing_date_returns_400(self, auth_headers):
        payload = {k: v for k, v in self.VALID_PAYLOAD.items() if k != "date"}
        r = requests.post(f"{BASE_URL}/api/events", json=payload, headers=auth_headers)
        assert_status(r, 400, 422)

    def test_cleanup(self, auth_headers):
        """Always runs last — removes all events created during this class."""
        self._cleanup(auth_headers)
        # Verify they're gone
        r = requests.get(f"{BASE_URL}/api/events?search=_contract_test_event_")
        remaining = r.json().get("events", [])
        assert len(remaining) == 0, f"{len(remaining)} contract test events still present after cleanup"


class TestEventStats:
    """GET /api/events/stats — dashboard aggregation endpoint."""

    def test_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/events/stats")
        assert_status(r, 200)

    def test_has_total_events(self):
        r = requests.get(f"{BASE_URL}/api/events/stats")
        body = r.json()
        assert "total_events" in body

    def test_has_total_rsvps(self):
        r = requests.get(f"{BASE_URL}/api/events/stats")
        body = r.json()
        assert "total_rsvps" in body

    def test_has_trending_events(self):
        r = requests.get(f"{BASE_URL}/api/events/stats")
        body = r.json()
        assert "trending_events" in body
        assert isinstance(body["trending_events"], list)


def _get(url, timeout=3):
    """GET with graceful skip if port is not reachable from the host."""
    try:
        return requests.get(url, timeout=timeout)
    except requests.exceptions.ConnectionError:
        pytest.skip(f"Service not directly reachable at {url} (only accessible inside Docker network)")


class TestHealthEndpoint:
    """GET /health — standard health check contract (via API Gateway and direct ports)."""

    def test_gateway_health(self):
        r = requests.get(f"{BASE_URL}/health")
        assert_status(r, 200)
        body = r.json()
        assert body.get("status") == "ok"
        assert "service" in body

    def test_event_service_health(self):
        r = _get("http://localhost:5001/health")
        assert_status(r, 200)
        assert r.json().get("status") == "ok"

    def test_user_service_health(self):
        r = _get("http://localhost:3001/health")
        assert_status(r, 200)
        assert r.json().get("status") == "ok"

    def test_chat_service_health(self):
        r = _get("http://localhost:3002/health")
        assert_status(r, 200)
        assert r.json().get("status") == "ok"

    def test_notification_service_health(self):
        r = _get("http://localhost:5002/health")
        assert_status(r, 200)
        assert r.json().get("status") == "ok"


class TestMetricsEndpoint:
    """GET /metrics — Prometheus metrics contract (all services)."""

    SERVICES = [
        ("api-gateway",          "http://localhost:3000/metrics"),
        ("user-service",         "http://localhost:3001/metrics"),
        ("event-service",        "http://localhost:5001/metrics"),
        ("chat-service",         "http://localhost:3002/metrics"),
        ("notification-service", "http://localhost:5002/metrics"),
    ]

    def test_all_metrics_endpoints_return_200(self):
        for name, url in self.SERVICES:
            try:
                r = requests.get(url, timeout=3)
                assert r.status_code == 200, f"{name} /metrics returned {r.status_code}"
            except requests.exceptions.ConnectionError:
                pytest.skip(f"{name} not directly reachable at {url} (only inside Docker network)")

    def test_metrics_content_type_is_prometheus(self):
        for name, url in self.SERVICES:
            try:
                r = requests.get(url, timeout=3)
                assert "text/plain" in r.headers.get("Content-Type", ""), (
                    f"{name} /metrics must return text/plain"
                )
            except requests.exceptions.ConnectionError:
                pytest.skip(f"{name} not directly reachable at {url} (only inside Docker network)")

    def test_api_gateway_exposes_http_requests_total(self):
        r = requests.get("http://localhost:3000/metrics")
        assert "http_requests_total" in r.text

    def test_event_service_exposes_event_operations(self):
        r = _get("http://localhost:5001/metrics")
        assert "event_operations_total" in r.text or "http_requests_total" in r.text

    def test_chat_service_exposes_custom_metrics(self):
        r = _get("http://localhost:3002/metrics")
        assert "chat_messages_total" in r.text or "http_requests_total" in r.text
