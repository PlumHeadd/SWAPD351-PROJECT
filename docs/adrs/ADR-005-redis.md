# ADR-005: Redis for Caching and Session Management

**Status:** Accepted
**Date:** 2026-03-15

## Context
Read-heavy workloads need caching. Multiple service instances need shared session store.

## Decision
Redis for caching event data (TTL 5min), storing refresh tokens, and rate limiting counters.

## Consequences
- **Positive:** Sub-ms reads, reduces DB load, atomic rate limit ops
- **Negative:** Additional infra, cache invalidation complexity
