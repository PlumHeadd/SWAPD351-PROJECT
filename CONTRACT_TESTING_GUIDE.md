# Contract Testing Framework - Eventify Platform

**Contract Testing Setup**  
**Framework**: Pact  
**Date**: May 14, 2026

---

## 1. User Service Contract Tests

**File**: `tests/contracts/user-service.contract.test.js`

```javascript
const { Pact } = require('@pact-foundation/pact');
const axios = require('axios');
const path = require('path');

const pact = new Pact({
  consumer: 'api-gateway',
  provider: 'user-service',
  port: 3001,
  dir: path.resolve(process.cwd(), 'pacts'),
  logLevel: 'warn'
});

describe('User Service Contract', () => {
  
  beforeAll(() => pact.setup());
  afterEach(() => pact.verify());
  afterAll(() => pact.finalize());

  describe('GET /api/users/:userId', () => {
    it('returns user details', () => {
      return pact
        .addInteraction({
          state: 'user 123 exists',
          uponReceiving: 'a request for user 123',
          withRequest: {
            method: 'GET',
            path: '/api/users/123',
            headers: {
              'Authorization': 'Bearer valid-token'
            }
          },
          willRespondWith: {
            status: 200,
            body: {
              id: '123',
              email: 'user@example.com',
              name: 'John Doe',
              avatar: 'https://example.com/avatar.jpg',
              role: 'user'
            }
          }
        })
        .then(() => {
          return axios.get(`${pact.mockServerUrl}/api/users/123`, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(200);
          expect(response.data.id).toBe('123');
          expect(response.data.email).toBe('user@example.com');
        });
    });
  });

  describe('POST /api/users', () => {
    it('creates a new user', () => {
      return pact
        .addInteraction({
          uponReceiving: 'a request to create a user',
          withRequest: {
            method: 'POST',
            path: '/api/users',
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              email: 'newuser@example.com',
              name: 'New User',
              googleId: 'google-123'
            }
          },
          willRespondWith: {
            status: 201,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              id: expect.any(String),
              email: 'newuser@example.com',
              name: 'New User',
              role: 'user'
            }
          }
        })
        .then(() => {
          return axios.post(`${pact.mockServerUrl}/api/users`, {
            email: 'newuser@example.com',
            name: 'New User',
            googleId: 'google-123'
          });
        })
        .then(response => {
          expect(response.status).toBe(201);
          expect(response.data.email).toBe('newuser@example.com');
        });
    });
  });

  describe('PUT /api/users/:userId', () => {
    it('updates user profile', () => {
      return pact
        .addInteraction({
          state: 'user 123 exists',
          uponReceiving: 'a request to update user 123',
          withRequest: {
            method: 'PUT',
            path: '/api/users/123',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid-token'
            },
            body: {
              name: 'Updated Name',
              avatar: 'https://example.com/new-avatar.jpg'
            }
          },
          willRespondWith: {
            status: 200,
            body: {
              id: '123',
              email: 'user@example.com',
              name: 'Updated Name',
              avatar: 'https://example.com/new-avatar.jpg'
            }
          }
        })
        .then(() => {
          return axios.put(`${pact.mockServerUrl}/api/users/123`, {
            name: 'Updated Name',
            avatar: 'https://example.com/new-avatar.jpg'
          }, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(200);
          expect(response.data.name).toBe('Updated Name');
        });
    });
  });

  describe('Authentication Errors', () => {
    it('returns 401 for missing token', () => {
      return pact
        .addInteraction({
          uponReceiving: 'a request without authentication',
          withRequest: {
            method: 'GET',
            path: '/api/users/123'
          },
          willRespondWith: {
            status: 401,
            body: {
              error: 'No token provided'
            }
          }
        })
        .then(() => {
          return axios.get(`${pact.mockServerUrl}/api/users/123`)
            .catch(error => error.response);
        })
        .then(response => {
          expect(response.status).toBe(401);
        });
    });
  });
});
```

---

## 2. Event Service Contract Tests

**File**: `tests/contracts/event-service.contract.test.js`

```javascript
const { Pact } = require('@pact-foundation/pact');
const axios = require('axios');
const path = require('path');

const pact = new Pact({
  consumer: 'api-gateway',
  provider: 'event-service',
  port: 5001,
  dir: path.resolve(process.cwd(), 'pacts'),
  logLevel: 'warn'
});

describe('Event Service Contract', () => {
  
  beforeAll(() => pact.setup());
  afterEach(() => pact.verify());
  afterAll(() => pact.finalize());

  describe('GET /api/events', () => {
    it('returns list of events with pagination', () => {
      return pact
        .addInteraction({
          uponReceiving: 'a request for events list',
          withRequest: {
            method: 'GET',
            path: '/api/events',
            query: {
              page: '1',
              limit: '10'
            },
            headers: {
              'Authorization': 'Bearer valid-token'
            }
          },
          willRespondWith: {
            status: 200,
            headers: {
              'X-Total-Count': '50',
              'X-Page': '1',
              'Content-Type': 'application/json'
            },
            body: {
              events: [
                {
                  id: expect.any(String),
                  title: expect.any(String),
                  description: expect.any(String),
                  date: expect.any(String),
                  location: expect.any(String),
                  capacity: expect.any(Number)
                }
              ],
              total: 50,
              page: 1,
              limit: 10
            }
          }
        })
        .then(() => {
          return axios.get(`${pact.mockServerUrl}/api/events?page=1&limit=10`, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(200);
          expect(response.data.events).toHaveLength(1);
          expect(response.data.total).toBe(50);
        });
    });
  });

  describe('POST /api/events', () => {
    it('creates a new event', () => {
      const eventData = {
        title: 'Tech Conference 2024',
        description: 'Annual tech conference',
        date: '2024-06-15T10:00:00Z',
        location: 'Convention Center',
        capacity: 500,
        tags: ['tech', 'conference']
      };

      return pact
        .addInteraction({
          state: 'user is organizer',
          uponReceiving: 'a request to create event',
          withRequest: {
            method: 'POST',
            path: '/api/events',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid-token'
            },
            body: eventData
          },
          willRespondWith: {
            status: 201,
            headers: {
              'Content-Type': 'application/json',
              'Location': expect.stringMatching(/\/api\/events\/[a-f0-9\-]+/)
            },
            body: {
              id: expect.any(String),
              ...eventData,
              createdAt: expect.any(String),
              organizer_id: expect.any(String)
            }
          }
        })
        .then(() => {
          return axios.post(`${pact.mockServerUrl}/api/events`, eventData, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(201);
          expect(response.data.title).toBe('Tech Conference 2024');
          expect(response.headers.location).toMatch(/\/api\/events\/[a-f0-9\-]+/);
        });
    });
  });

  describe('GET /api/events/:eventId', () => {
    it('returns event details', () => {
      return pact
        .addInteraction({
          state: 'event 456 exists',
          uponReceiving: 'a request for event details',
          withRequest: {
            method: 'GET',
            path: '/api/events/456',
            headers: {
              'Authorization': 'Bearer valid-token'
            }
          },
          willRespondWith: {
            status: 200,
            body: {
              id: '456',
              title: 'Tech Conference 2024',
              description: 'Annual tech conference',
              date: '2024-06-15T10:00:00Z',
              location: 'Convention Center',
              capacity: 500,
              attendee_count: 245
            }
          }
        })
        .then(() => {
          return axios.get(`${pact.mockServerUrl}/api/events/456`, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(200);
          expect(response.data.id).toBe('456');
        });
    });
  });

  describe('Error Handling', () => {
    it('returns 404 for non-existent event', () => {
      return pact
        .addInteraction({
          uponReceiving: 'a request for non-existent event',
          withRequest: {
            method: 'GET',
            path: '/api/events/non-existent',
            headers: {
              'Authorization': 'Bearer valid-token'
            }
          },
          willRespondWith: {
            status: 404,
            body: {
              error: 'Event not found'
            }
          }
        })
        .then(() => {
          return axios.get(`${pact.mockServerUrl}/api/events/non-existent`, {
            headers: { 'Authorization': 'Bearer valid-token' }
          }).catch(error => error.response);
        })
        .then(response => {
          expect(response.status).toBe(404);
        });
    });

    it('returns 400 for invalid event data', () => {
      return pact
        .addInteraction({
          uponReceiving: 'a request with invalid data',
          withRequest: {
            method: 'POST',
            path: '/api/events',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid-token'
            },
            body: {
              title: '', // Invalid: empty title
              capacity: -1 // Invalid: negative capacity
            }
          },
          willRespondWith: {
            status: 400,
            body: {
              errors: expect.any(Array)
            }
          }
        })
        .then(() => {
          return axios.post(`${pact.mockServerUrl}/api/events`, {
            title: '',
            capacity: -1
          }, {
            headers: { 'Authorization': 'Bearer valid-token' }
          }).catch(error => error.response);
        })
        .then(response => {
          expect(response.status).toBe(400);
        });
    });
  });
});
```

---

## 3. RSVP Service Interactions Contract

**File**: `tests/contracts/rsvp.contract.test.js`

```javascript
const { Pact } = require('@pact-foundation/pact');
const axios = require('axios');
const path = require('path');

const pact = new Pact({
  consumer: 'api-gateway',
  provider: 'event-service',
  port: 5001,
  dir: path.resolve(process.cwd(), 'pacts')
});

describe('RSVP Contract', () => {
  
  beforeAll(() => pact.setup());
  afterEach(() => pact.verify());
  afterAll(() => pact.finalize());

  describe('POST /api/events/:eventId/rsvp', () => {
    it('creates RSVP', () => {
      return pact
        .addInteraction({
          state: 'event 789 exists with capacity',
          uponReceiving: 'a request to RSVP for event',
          withRequest: {
            method: 'POST',
            path: '/api/events/789/rsvp',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid-token'
            },
            body: {
              status: 'attending',
              comment: 'Looking forward to it'
            }
          },
          willRespondWith: {
            status: 201,
            body: {
              id: expect.any(String),
              event_id: '789',
              user_id: expect.any(String),
              status: 'attending',
              created_at: expect.any(String)
            }
          }
        })
        .then(() => {
          return axios.post(`${pact.mockServerUrl}/api/events/789/rsvp`, {
            status: 'attending',
            comment: 'Looking forward to it'
          }, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(201);
          expect(response.data.status).toBe('attending');
        });
    });
  });

  describe('GET /api/events/:eventId/rsvp/:userId', () => {
    it('retrieves RSVP status', () => {
      return pact
        .addInteraction({
          state: 'user has RSVP for event',
          uponReceiving: 'a request for RSVP status',
          withRequest: {
            method: 'GET',
            path: '/api/events/789/rsvp/user123',
            headers: {
              'Authorization': 'Bearer valid-token'
            }
          },
          willRespondWith: {
            status: 200,
            body: {
              id: expect.any(String),
              event_id: '789',
              user_id: 'user123',
              status: 'attending'
            }
          }
        })
        .then(() => {
          return axios.get(`${pact.mockServerUrl}/api/events/789/rsvp/user123`, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(200);
          expect(response.data.status).toBe('attending');
        });
    });
  });
});
```

---

## 4. Chat Service Contract

**File**: `tests/contracts/chat.contract.test.js`

```javascript
const { Pact } = require('@pact-foundation/pact');
const axios = require('axios');
const path = require('path');

const pact = new Pact({
  consumer: 'api-gateway',
  provider: 'chat-service',
  port: 3002,
  dir: path.resolve(process.cwd(), 'pacts')
});

describe('Chat Service Contract', () => {
  
  beforeAll(() => pact.setup());
  afterEach(() => pact.verify());
  afterAll(() => pact.finalize());

  describe('GET /api/messages/:eventId', () => {
    it('returns message history with pagination', () => {
      return pact
        .addInteraction({
          state: 'event 456 has messages',
          uponReceiving: 'a request for message history',
          withRequest: {
            method: 'GET',
            path: '/api/messages/456',
            query: {
              limit: '20',
              offset: '0'
            },
            headers: {
              'Authorization': 'Bearer valid-token'
            }
          },
          willRespondWith: {
            status: 200,
            body: {
              messages: [
                {
                  id: expect.any(String),
                  event_id: '456',
                  user_id: expect.any(String),
                  content: expect.any(String),
                  created_at: expect.any(String)
                }
              ],
              total: 45,
              limit: 20,
              offset: 0
            }
          }
        })
        .then(() => {
          return axios.get(
            `${pact.mockServerUrl}/api/messages/456?limit=20&offset=0`,
            { headers: { 'Authorization': 'Bearer valid-token' } }
          );
        })
        .then(response => {
          expect(response.status).toBe(200);
          expect(response.data.messages).toBeDefined();
          expect(response.data.total).toBe(45);
        });
    });
  });

  describe('POST /api/messages', () => {
    it('sends a message', () => {
      return pact
        .addInteraction({
          state: 'user is in event',
          uponReceiving: 'a request to send message',
          withRequest: {
            method: 'POST',
            path: '/api/messages',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid-token'
            },
            body: {
              event_id: '456',
              content: 'Looking forward to this event!'
            }
          },
          willRespondWith: {
            status: 201,
            body: {
              id: expect.any(String),
              event_id: '456',
              user_id: expect.any(String),
              content: 'Looking forward to this event!',
              created_at: expect.any(String)
            }
          }
        })
        .then(() => {
          return axios.post(`${pact.mockServerUrl}/api/messages`, {
            event_id: '456',
            content: 'Looking forward to this event!'
          }, {
            headers: { 'Authorization': 'Bearer valid-token' }
          });
        })
        .then(response => {
          expect(response.status).toBe(201);
          expect(response.data.content).toBe('Looking forward to this event!');
        });
    });
  });
});
```

---

## 5. Running Contract Tests

### Installation

```bash
npm install --save-dev @pact-foundation/pact @pact-foundation/pact-node
```

### Run Tests

```bash
# Run all contract tests
npm run test:contracts

# Run specific contract
npm test -- user-service.contract.test.js

# Generate consumer contracts
npm run test:contracts -- --generatePactFiles

# Verify provider against contracts
npm run test:pacts
```

### package.json Scripts

```json
{
  "scripts": {
    "test:contracts": "jest tests/contracts --testTimeout=10000",
    "test:pacts": "pact-node verify",
    "pact:publish": "pact-broker publish pacts --consumerVersion=$npm_package_version",
    "pact:can-i-deploy": "pact-broker can-i-deploy --pacticipant="
  }
}
```

---

## 6. Pact Broker Configuration (Optional)

```bash
# Deploy Pact Broker
docker run -d \
  -e PACT_BROKER_DATABASE_USERNAME=pact \
  -e PACT_BROKER_DATABASE_PASSWORD=pact \
  -p 9292:9292 \
  pactfoundation/pact-broker:latest

# Publish contracts
pact-broker publish pacts \
  --consumer-app-version=$VERSION \
  --broker-base-url=http://localhost:9292
```

---

## 7. Best Practices

✓ **Test request/response contracts**, not implementation details  
✓ **Use matchers** for dynamic values (dates, IDs)  
✓ **Test error cases** (400, 401, 404, 500)  
✓ **Keep contracts isolated** (one consumer, one provider)  
✓ **Run tests in CI/CD** pipeline  
✓ **Publish contracts** to broker for verification  
✓ **Version contracts** with API versions  
✓ **Maintain backward compatibility**  

---

**Document Version**: 1.0  
**Last Updated**: May 14, 2026  
**Status**: Production Ready

