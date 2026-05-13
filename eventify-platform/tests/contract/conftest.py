"""
Contract test configuration.

Skips all contract tests automatically if the API Gateway (localhost:3000)
is not reachable — avoids false failures when running in isolation.
"""

import requests
import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "contract: mark test as a contract test"
    )


def pytest_collection_modifyitems(config, items):
    try:
        requests.get("http://localhost:3000/health", timeout=2)
    except Exception:
        skip_marker = pytest.mark.skip(reason="API Gateway not reachable — start services first")
        for item in items:
            item.add_marker(skip_marker)
