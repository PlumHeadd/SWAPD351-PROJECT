# ADR-003: OAuth2 via Google with JWT Tokens

**Status:** Accepted
**Date:** 2026-03-15

## Context
Project requires OAuth2 (Google). Microservices need stateless auth.

## Decision
Google OAuth2 Authorization Code flow. User Service issues RS256-signed JWTs. API Gateway validates JWT on each request.

## Consequences
- **Positive:** Stateless auth, no DB lookup per request, Google's security
- **Negative:** JWT revocation delay, Google dependency
