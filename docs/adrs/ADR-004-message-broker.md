# ADR-004: RabbitMQ as Message Broker

**Status:** Accepted
**Date:** 2026-03-15

## Context
Notifications and side-effects should not block user-facing requests.

## Decision
Use RabbitMQ with durable queues and topic exchanges for async inter-service communication.

## Consequences
- **Positive:** Decoupled services, durable delivery, flexible routing
- **Negative:** Infrastructure complexity, message ordering limited to single queue
