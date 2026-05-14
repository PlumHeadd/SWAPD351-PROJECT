# Contract Testing Setup Guide

Contract testing verifies that services conform to agreed interfaces (contracts) without requiring full end-to-end testing.

## Framework: Pact

Pact is a consumer-driven contract testing framework that enables services to validate their assumptions about each other.

### Installation

```bash
# Install Pact dependencies
npm install --save-dev @pact-foundation/pact

# Or for Python
pip install pact pytest
```

### Configuration File

File: `pactfile.json`

```json
{
  "consumer": "EventifyUI",
  "provider": "UserService",
  "port": 1234,
  "host": "127.0.0.1",
  "timeout": 5000,
  "logLevel": "info",
  "spec_version": "2.0.0"
}
```

## Running Contract Tests

```bash
# Run all contract tests
npm test tests/contract/

# Run specific contract test
npm test tests/contract/test_user_service_contracts.js

# Generate contract artifacts
npm run test:contracts

# Publish contracts to Pact Broker
npm run pact:publish
```

## Pact Broker Setup (Centralized Contract Registry)

```bash
# Docker setup
docker run -d \
  --name pact-broker \
  -p 80:80 \
  -e PACT_BROKER_DATABASE_URL=postgresql://pact:pact@postgres/pact_broker \
  -e PACT_BROKER_LOG_LEVEL=info \
  pactfoundation/pact-broker:latest

# Verify broker is running
curl http://localhost/
```

## Contract Testing Workflow

### Step 1: Consumer Defines Expectations

```javascript
// tests/contract/test_user_service_contracts.js
import { Consumer, Matchers } from '@pact-foundation/pact';

const userServicePact = new Consumer('EventifyUI')
  .has_state('user 123 exists')
  .upon_receiving('a request for user details')
  .with_request('get', '/api/users/me', {
    headers: {
      'Authorization': 'Bearer valid-token'
    }
  })
  .will_respond_with(200, {
    body: {
      id: Matchers.uuid(),
      email: Matchers.email(),
      name: Matchers.string('John Doe')
    }
  });

describe('User Service Contracts', () => {
  it('returns user details', (done) => {
    userServicePact.verify(() => {
      // Consumer makes request to pact mock
      return fetch('http://127.0.0.1:1234/api/users/me', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })
      .then(res => res.json())
      .then(json => {
        expect(json.id).toBeDefined();
        expect(json.email).toBeDefined();
      });
    }).then(done).catch(done);
  });
});
```

### Step 2: Provider Verifies Contract

```javascript
// tests/contract/provider-verification.js
import { Verifier } from '@pact-foundation/pact';

// Provider-side verification
describe('User Service', () => {
  it('honors contracts', () => {
    return new Verifier({
      providerBaseUrl: 'http://localhost:3001',
      pactUrls: ['./pacts/eventifyui-userservice.json']
    }).verify();
  });
});
```

### Step 3: Publish to Broker

```bash
# Publish consumer contracts
npm run pact:publish -- \
  --consumerVersion 1.0.0 \
  --brokerUrl http://pact-broker:80 \
  --tag production

# Provider verifies published contracts
npm run pact:verify -- \
  --providerVersion 1.0.0 \
  --brokerUrl http://pact-broker:80 \
  --tag production
```

## Contract Examples by Service

### User Service Contracts

```javascript
// tests/contract/test_user_service_contracts.js
describe('User Service - Authentication', () => {
  it('returns tokens on successful OAuth callback', () => {
    return userServicePact
      .given('user authenticated with Google')
      .upon_receiving('a request to complete OAuth callback')
      .with_request('post', '/api/auth/google/callback', {
        body: { code: 'auth-code-123' }
      })
      .will_respond_with(302, {
        headers: {
          'Set-Cookie': Matchers.string('access_token=...')
        }
      })
      .verify();
  });

  it('returns user profile when authenticated', () => {
    return userServicePact
      .given('user 123 is logged in')
      .upon_receiving('a request for current user')
      .with_request('get', '/api/users/me', {
        headers: { 'x-user-id': '123' }
      })
      .will_respond_with(200, {
        body: {
          id: Matchers.uuid(),
          email: 'user@example.com'
        }
      })
      .verify();
  });

  it('rejects invalid refresh token', () => {
    return userServicePact
      .given('invalid refresh token provided')
      .upon_receiving('a request to refresh token')
      .with_request('post', '/api/auth/refresh', {
        body: { refresh_token: 'invalid' }
      })
      .will_respond_with(401, {
        body: { error: 'Invalid refresh token' }
      })
      .verify();
  });
});
```

### Event Service Contracts

```javascript
// tests/contract/test_event_service_contracts.js
describe('Event Service - Event Operations', () => {
  it('returns paginated event list', () => {
    return eventServicePact
      .given('10 events in database')
      .upon_receiving('a request to list events')
      .with_request('get', '/api/events?page=1&limit=5')
      .will_respond_with(200, {
        body: {
          events: Matchers.eachLike({
            id: Matchers.uuid(),
            title: Matchers.string('Tech Conference'),
            date: Matchers.iso8601DateTime(),
            current_attendees: Matchers.integer(5)
          }, { min: 1 }),
          total: 10,
          page: 1
        }
      })
      .verify();
  });

  it('creates event for authenticated user', () => {
    return eventServicePact
      .given('user 123 is authenticated')
      .upon_receiving('a request to create event')
      .with_request('post', '/api/events', {
        headers: { 'x-user-id': '123' },
        body: {
          title: 'New Event',
          description: 'Event description',
          date: '2026-07-01T18:00:00Z',
          location: 'New York'
        }
      })
      .will_respond_with(201, {
        body: {
          id: Matchers.uuid(),
          title: 'New Event',
          creator_id: '123'
        }
      })
      .verify();
  });

  it('rejects RSVP without authentication', () => {
    return eventServicePact
      .given('user not authenticated')
      .upon_receiving('a request to RSVP without auth')
      .with_request('post', '/api/events/event-123/rsvp')
      .will_respond_with(401, {
        body: { error: 'Authentication required' }
      })
      .verify();
  });
});
```

### API Gateway Contracts

```javascript
// tests/contract/test_api_gateway_contracts.js
describe('API Gateway - Routing & Security', () => {
  it('routes requests to user service', () => {
    return gatewayPact
      .upon_receiving('a request to user service endpoint')
      .with_request('get', '/api/users/me', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })
      .will_respond_with(200, {
        body: Matchers.eachLike({ id: Matchers.uuid() })
      })
      .verify();
  });

  it('enforces rate limiting', () => {
    return gatewayPact
      .given('client has exceeded rate limit')
      .upon_receiving('a request exceeding rate limit')
      .with_request('get', '/api/events')
      .will_respond_with(429, {
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Matchers.integer()
        }
      })
      .verify();
  });

  it('validates JWT tokens', () => {
    return gatewayPact
      .given('invalid JWT token provided')
      .upon_receiving('a request with invalid token')
      .with_request('get', '/api/users/me', {
        headers: { 'Authorization': 'Bearer invalid-token' }
      })
      .will_respond_with(403, {
        body: { error: 'Invalid token' }
      })
      .verify();
  });
});
```

### Error Handling Contracts

```javascript
// tests/contract/test_error_contracts.js
describe('Error Handling Contracts', () => {
  it('returns 404 for nonexistent resource', () => {
    return eventServicePact
      .given('event does not exist')
      .upon_receiving('a request for nonexistent event')
      .with_request('get', '/api/events/nonexistent-id')
      .will_respond_with(404, {
        body: { error: 'Event not found' }
      })
      .verify();
  });

  it('returns 400 for invalid input', () => {
    return eventServicePact
      .given('invalid event data provided')
      .upon_receiving('a request to create event with missing required fields')
      .with_request('post', '/api/events', {
        body: { title: 'Event without date' }
      })
      .will_respond_with(400, {
        body: { error: 'date, location required' }
      })
      .verify();
  });

  it('returns 500 on server error', () => {
    return eventServicePact
      .given('database connection fails')
      .upon_receiving('a request during database outage')
      .with_request('get', '/api/events')
      .will_respond_with(500, {
        body: { error: 'Internal server error' }
      })
      .verify();
  });
});
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/contract-tests.yml
name: Contract Tests

on: [push, pull_request]

jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      
      # Consumer contract tests
      - run: npm run test:contracts:consumer
      
      # Publish contracts
      - run: npm run pact:publish
        if: github.ref == 'refs/heads/main'
      
      # Provider verification
      - run: npm run test:contracts:provider
        if: github.ref == 'refs/heads/main'
```

## Best Practices

✅ **Consumer-driven contracts**
- Consumers define expectations first
- Providers implement to match expectations
- Reduces over-engineering

✅ **Semantic versioning**
- Major: Breaking contract changes
- Minor: New optional fields
- Patch: Documentation updates

✅ **Contract lifecycle**
- Develop → Tag as dev
- Testing → Tag as test
- Production → Tag as prod

✅ **Regular verification**
- Run on every push
- Publish to broker
- Alert on contract breaks

✅ **Matchers for flexibility**
- Use UUID matchers for IDs (not exact values)
- Use email matchers for addresses
- Use integer matchers for quantities
- Prevents brittle tests

## Troubleshooting

### Contract Mismatch

```
Error: Contract mismatch - expected field 'email', got undefined
Solution: Ensure provider returns all fields expected by consumer
```

### Pact Broker Timeout

```
Error: Connection timeout to pact broker
Solution: Verify broker is running, check network connectivity
```

### State Setup Failures

```
Error: State 'user 123 exists' not set up
Solution: Implement state setup in provider (database seeds, mocks)
```

## Resources

- Pact Documentation: https://docs.pact.org/
- Pact Broker: https://github.com/pact-foundation/pact_broker
- Consumer-Driven Contracts: https://martinfowler.com/articles/consumerDrivenContracts.html
