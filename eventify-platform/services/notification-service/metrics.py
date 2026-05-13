"""
Comprehensive Prometheus metrics for Notification Service
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

notification_send_duration_seconds = Histogram(
    'notification_send_duration_seconds',
    'Notification send operation execution time',
    ['notification_type', 'status'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
)

notification_send_operations_total = Counter(
    'notification_send_operations_total',
    'Total notification send operations',
    ['notification_type', 'status']
)

notifications_sent_total = Counter(
    'notifications_sent_total',
    'Total notifications sent successfully',
    ['type']
)

notifications_failed_total = Counter(
    'notifications_failed_total',
    'Total notifications that failed to send',
    ['type', 'error_type']
)

notification_queue_size = Gauge(
    'notification_queue_size',
    'Current notification queue size'
)

# ===== 3. DEPENDENCY OBSERVABILITY =====

# Redis operations
redis_operation_duration_seconds = Histogram(
    'redis_operation_duration_seconds',
    'Redis operation latency',
    ['operation', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
)

redis_operation_errors_total = Counter(
    'redis_operation_errors_total',
    'Total Redis operation errors',
    ['operation', 'error_type']
)

# RabbitMQ operations
rabbitmq_consume_duration_seconds = Histogram(
    'rabbitmq_consume_duration_seconds',
    'RabbitMQ message consume latency',
    ['routing_key', 'status'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]
)

rabbitmq_consume_errors_total = Counter(
    'rabbitmq_consume_errors_total',
    'Total RabbitMQ consume errors',
    ['routing_key', 'error_type']
)

rabbitmq_messages_processed_total = Counter(
    'rabbitmq_messages_processed_total',
    'Total RabbitMQ messages processed',
    ['routing_key', 'status']
)

# External API calls (User Service)
external_api_call_duration_seconds = Histogram(
    'external_api_call_duration_seconds',
    'External API call latency',
    ['service', 'operation', 'status'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
)

external_api_call_errors_total = Counter(
    'external_api_call_errors_total',
    'Total external API call errors',
    ['service', 'operation', 'error_type']
)

# SMTP operations
smtp_send_duration_seconds = Histogram(
    'smtp_send_duration_seconds',
    'SMTP email send latency',
    ['status'],
    buckets=[0.1, 0.5, 1, 2.5, 5, 10, 30]
)

smtp_send_errors_total = Counter(
    'smtp_send_errors_total',
    'Total SMTP send errors',
    ['error_type']
)

# ===== HELPER FUNCTIONS =====

def track_request(method, endpoint, status_code, duration):
    """Track HTTP request metrics"""
    http_requests_total.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
    http_request_duration_seconds.labels(method=method, endpoint=endpoint, status_code=status_code).observe(duration)
    
    if status_code >= 400:
        error_type = 'server_error' if status_code >= 500 else 'client_error'
        http_errors_total.labels(method=method, endpoint=endpoint, status_code=status_code, error_type=error_type).inc()

def track_notification_send(notification_type):
    """Decorator to track notification send operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            status = 'failure'
            try:
                result = func(*args, **kwargs)
                status = 'success'
                notifications_sent_total.labels(type=notification_type).inc()
                return result
            except Exception as e:
                status = 'failure'
                error_type = type(e).__name__
                notifications_failed_total.labels(type=notification_type, error_type=error_type).inc()
                raise
            finally:
                duration = time.time() - start
                notification_send_duration_seconds.labels(notification_type=notification_type, status=status).observe(duration)
                notification_send_operations_total.labels(notification_type=notification_type, status=status).inc()
        return wrapper
    return decorator

def track_redis_operation(operation):
    """Track Redis operation with timing"""
    class RedisTimer:
        def __init__(self, operation):
            self.operation = operation
            self.start = time.time()
            
        def __enter__(self):
            return self
            
        def __exit__(self, exc_type, exc_val, exc_tb):
            duration = time.time() - self.start
            if exc_type is None:
                status = 'success'
                redis_operation_duration_seconds.labels(operation=self.operation, status=status).observe(duration)
            else:
                status = 'failure'
                error_type = exc_type.__name__ if exc_type else 'Unknown'
                redis_operation_duration_seconds.labels(operation=self.operation, status=status).observe(duration)
                redis_operation_errors_total.labels(operation=self.operation, error_type=error_type).inc()
            return False
    
    return RedisTimer(operation)

def track_rabbitmq_consume(routing_key):
    """Track RabbitMQ message consume operation"""
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
                rabbitmq_consume_duration_seconds.labels(routing_key=self.routing_key, status=status).observe(duration)
                rabbitmq_messages_processed_total.labels(routing_key=self.routing_key, status=status).inc()
            else:
                status = 'failure'
                error_type = exc_type.__name__ if exc_type else 'Unknown'
                rabbitmq_consume_duration_seconds.labels(routing_key=self.routing_key, status=status).observe(duration)
                rabbitmq_consume_errors_total.labels(routing_key=self.routing_key, error_type=error_type).inc()
                rabbitmq_messages_processed_total.labels(routing_key=self.routing_key, status=status).inc()
            return False
    
    return RabbitMQTimer(routing_key)

def track_external_api_call(service, operation):
    """Track external API call with timing"""
    class APITimer:
        def __init__(self, service, operation):
            self.service = service
            self.operation = operation
            self.start = time.time()
            
        def __enter__(self):
            return self
            
        def __exit__(self, exc_type, exc_val, exc_tb):
            duration = time.time() - self.start
            if exc_type is None:
                status = 'success'
                external_api_call_duration_seconds.labels(service=self.service, operation=self.operation, status=status).observe(duration)
            else:
                status = 'failure'
                error_type = exc_type.__name__ if exc_type else 'Unknown'
                external_api_call_duration_seconds.labels(service=self.service, operation=self.operation, status=status).observe(duration)
                external_api_call_errors_total.labels(service=self.service, operation=self.operation, error_type=error_type).inc()
            return False
    
    return APITimer(service, operation)

def track_smtp_send():
    """Track SMTP email send with timing"""
    class SMTPTimer:
        def __init__(self):
            self.start = time.time()
            
        def __enter__(self):
            return self
            
        def __exit__(self, exc_type, exc_val, exc_tb):
            duration = time.time() - self.start
            if exc_type is None:
                status = 'success'
                smtp_send_duration_seconds.labels(status=status).observe(duration)
            else:
                status = 'failure'
                error_type = exc_type.__name__ if exc_type else 'Unknown'
                smtp_send_duration_seconds.labels(status=status).observe(duration)
                smtp_send_errors_total.labels(error_type=error_type).inc()
            return False
    
    return SMTPTimer()
