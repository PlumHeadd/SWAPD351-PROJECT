"""
Pytest configuration for Eventify tests.
Handles proper isolation of event-service and notification-service modules.
"""
import sys
import os


def pytest_configure(config):
    """
    Setup test configuration before collecting tests.
    Ensure clean sys.modules state for each test session.
    """
    # Clean up any previously imported app modules
    modules_to_remove = [key for key in sys.modules.keys() if 'app' in key]
    for module in modules_to_remove:
        del sys.modules[module]
