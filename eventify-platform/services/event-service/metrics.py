"""
Comprehensive Prometheus metrics for Event Service
Implements API-level, service-level, and dependency observability
"""
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST, REGISTRY
import time
from functools import wraps

# ===== 1. API-LEVEL METRICS =====

http_requests_total = Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'endpoint', 'status_code']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency in seconds',
    ['method', 'endpoint', 'status_code'],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
)

http_active_requests = Gauge(
    'http_active_requests',
    'Number of active HTTP requests',
    ['method']
)

http_errors_total = Counter(
    'http_errors_total',
    'Total number of HTTP errors',
    ['method', 'endpoint', 'status_code', 'error_type']
)

# ===== 2. SERVICE-LEVEL INSTRUMENTATION =====

event_operation_duration_seconds = Histogram(
    'event_operation_duration_seconds',
    'Event operation execution time',
    ['operation', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]
)

event_operations_total = Counter(
    'event_operations_total',
    'Total event operations',
    ['operation', 'status']
)

rsvp_operation_duration_seconds = Histogram(
    'rsvp_operation_duration_seconds',
    'RSVP operation execution time',
    ['operation', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
)

rsvp_operations_total = Counter(
    'rsvp_operations_total',
    'Total RSVP operations',
    ['operation', 'status']
)

events_created_total = Counter(
    'events_created_total',
    'Total events created'
)

rsvps_created_total = Counter(
    'rsvps_created_total',
    'Total RSVPs created'
)

event_capacity_utilization = Gauge(
    'event_capacity_utilization',
    'Event capacity utilization (0-1)',
    ['event_id']
)

# ===== 3. DEPENDENCY OBSERVABILITY =====

# MongoDB operations
mongodb_operation_duration_seconds = Histogram(
    'mongodb_operation_duration_seconds',
    'MongoDB operation latency',
    ['operation', 'collection', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
)

mongodb_operation_errors_total = Counter(
    'mongodb_operation_errors_total',
    'Total MongoDB operation errors',
    ['operation', 'collection', 'error_type']
)

# Redis cache operations
cache_operation_duration_seconds = Histogram(
    'cache_operation_duration_seconds',
    'Cache operation latency',
    ['operation', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
)

cache_operation_errors_total = Counter(
    'cache_operation_errors_total',
    'Total cache operation errors',
    ['operation', 'error_type']
)

cache_hits_total = Counter(
    'cache_hits_total',
    'Total cache hits'
)

cache_misses_total = Counter(
    'cache_misses_total',
    'Total cache misses'
)

# RabbitMQ operations
rabbitmq_publish_duration_seconds = Histogram(
    'rabbitmq_publish_duration_seconds',
    'RabbitMQ publish latency',
    ['routing_key', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
)

rabbitmq_publish_errors_total = Counter(
    'rabbitmq_publish_errors_total',
    'Total RabbitMQ publish errors',
    ['routing_key', 'error_type']
)

# Circuit breaker metrics
circuit_breaker_state = Gauge(
    'circuit_breaker_state',
    'Circuit breaker state (0=closed, 1=open, 0.5=half-open)',
    ['breaker_name']
)

circuit_breaker_failures_total = Counter(
    'circuit_breaker_failures_total',
    'Total circuit breaker failures',
    ['breaker_name']
)

# ===== HELPER FUNCTIONS =====

def track_request(method, endpoint, status_code, duration):
    """Track HTTP request metrics"""
    http_requests_total.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
    http_request_duration_seconds.labels(method=method, endpoint=endpoint, status_code=status_code).observe(duration)
    
    if status_code >= 400:
        error_type = 'server_error' if status_code >= 500 else 'client_error'
        http_errors_total.labels(method=method, endpoint=endpoint, status_code=status_code, error_type=error_type).inc()

def track_event_operation(operation):
    """Decorator to track event operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            status = 'failure'
            try:
                result = func(*args, **kwargs)
                status = 'success'
                return result
            except Exception as e:
                status = 'failure'
                raise
            finally:
                duration = time.time() - start
                event_operation_duration_seconds.labels(operation=operation, status=status).observe(duration)
                event_operations_total.labels(operation=operation, status=status).inc()
        return wrapper
    return decorator

def track_rsvp_operation(operation):
    """Decorator to track RSVP operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            status = 'failure'
            try:
                result = func(*args, **kwargs)
                status = 'success'
                return result
            except Exception as e:
                status = 'failure'
                raise
            finally:
                duration = time.time() - start
                rsvp_operation_duration_seconds.labels(operation=operation, status=status).observe(duration)
                rsvp_operations_total.labels(operation=operation, status=status).inc()
        return wrapper
    return decorator

def track_mongodb_operation(operation, collection):
    """Decorator to track MongoDB operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            status = 'failure'
            try:
                result = func(*args, **kwargs)
                status = 'success'
                return result
            except Exception as e:
                status = 'failure'
                error_type = type(e).__name__
                mongodb_operation_errors_total.labels(operation=operation, collection=collection, error_type=error_type).inc()
                raise
            finally:
                duration = time.time() - start
                mongodb_operation_duration_seconds.labels(operation=operation, collection=collection, status=status).observe(duration)
        return wrapper
    return decorator

def track_cache_operation(operation):
    """Track cache operation with timing"""
    class CacheTimer:
        def __init__(self, operation):
            self.operation = operation
            self.start = time.time()
            
        def __enter__(self):
            return self
            
        def __exit__(self, exc_type, exc_val, exc_tb):
            duration = time.time() - self.start
            if exc_type is None:
                status = 'success'
                cache_operation_duration_seconds.labels(operation=self.operation, status=status).observe(duration)
            else:
                status = 'failure'
                error_type = exc_type.__name__ if exc_type else 'Unknown'
                cache_operation_duration_seconds.labels(operation=self.operation, status=status).observe(duration)
                cache_operation_errors_total.labels(operation=self.operation, error_type=error_type).inc()
            return False
    
    return CacheTimer(operation)

def track_rabbitmq_publish(routing_key):
    """Track RabbitMQ publish operation"""
    class RabbitMQTimer:
        def __init__(self, routing_key):
            self.routing_key = routing_key
            self.start = time.time()
            
        def __enter__(self):
            return self
            
        def __exit__(self, exc_type, exc_val, exc_tb):
            duration = time.time() - self.start
            if exc_type is None:
                status = 'success'
                rabbitmq_publish_duration_seconds.labels(routing_key=self.routing_key, status=status).observe(duration)
            else:
                status = 'failure'
                error_type = exc_type.__name__ if exc_type else 'Unknown'
                rabbitmq_publish_duration_seconds.labels(routing_key=self.routing_key, status=status).observe(duration)
                rabbitmq_publish_errors_total.labels(routing_key=self.routing_key, error_type=error_type).inc()
            return False
    
    return RabbitMQTimer(routing_key)

def record_cache_hit():
    """Record a cache hit"""
    cache_hits_total.inc()

def record_cache_miss():
    """Record a cache miss"""
    cache_misses_total.inc()

def record_event_created():
    """Record an event creation"""
    events_created_total.inc()

def record_rsvp_created():
    """Record an RSVP creation"""
    rsvps_created_total.inc()
