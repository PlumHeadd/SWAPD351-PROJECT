# ADR-001: Adoption of Microservices Architecture

**Status:** Accepted
**Date:** 2026-03-15

## Context
Eventify comprises distinct domains (user management, events, chat, notifications) with different scaling needs. A monolithic approach would force all domains to scale together.

## Decision
Decompose the system into five independently deployable microservices: API Gateway, User Service, Event Service, Chat Service, and Notification Service.

## Consequences
- **Positive:** Independent scaling, deployment, technology flexibility, fault isolation
- **Negative:** Increased operational complexity, network latency, eventual consistency
