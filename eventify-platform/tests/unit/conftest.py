"""
Pytest configuration for unit tests.
Isolates event-service and notification-service modules.
"""
import sys
import os


def pytest_configure(config):
    """Setup before collecting unit tests."""
    # Add event-service to path for proper imports
    event_service_path = os.path.join(
        os.path.dirname(__file__),
        '..',
        'services',
        'event-service'
    )
    if event_service_path not in sys.path:
        sys.path.insert(0, event_service_path)


def pytest_collection_modifyitems(items):
    """Isolate tests by service."""
    for item in items:
        # Add marker to identify which service is being tested
        if 'test_event_service' in str(item.fspath):
            item.add_marker('event_service')
        elif 'test_notification_service' in str(item.fspath):
            item.add_marker('notification_service')
