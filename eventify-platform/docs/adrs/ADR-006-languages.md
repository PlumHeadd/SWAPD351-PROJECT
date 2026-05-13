# ADR-006: Multi-Language Service Implementation

**Status:** Accepted
**Date:** 2026-03-15

## Context
Different services have different runtime needs. Project requires demonstrating polyglot microservices.

## Decision
- Node.js: API Gateway, User Service (Passport.js OAuth2), Chat Service (Socket.io WebSockets)
- Python/Flask: Event Service (CRUD, team familiarity), Notification Service (AMQP consumer)

## Consequences
- **Positive:** Best language per workload, team plays to strengths
- **Negative:** Two ecosystems (npm + pip) to maintain
