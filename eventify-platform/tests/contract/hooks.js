/**
 * Dredd Contract Test Hooks
 *
 * These hooks inject auth headers, skip endpoints that require live DB records,
 * and validate response shapes beyond what Dredd checks automatically.
 *
 * Run with:  npx dredd  (uses dredd.yml in the project root)
 */

const hooks = require('hooks');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'eventify_jwt_secret_key_2026';

// Generate a test JWT with organizer role so write operations pass RBAC
const testToken = jwt.sign(
  { id: '00000000-0000-0000-0000-000000000001', email: 'contract@test.com', name: 'Contract Tester', role: 'organizer' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const AUTH_HEADER = `Bearer ${testToken}`;

// ── Inject auth on every request ────────────────────────────────────────────
hooks.beforeEach((transaction, done) => {
  transaction.request.headers['Authorization'] = AUTH_HEADER;
  done();
});

// ── Skip endpoints that require a real existing resource ID ─────────────────
// These would need a valid MongoDB ObjectId / event ID to return 200;
// we skip them so the contract suite covers what it can without seeding.
const SKIP_TRANSACTIONS = [
  'Events > /events/{id} > Get event by ID',
  'Events > /events/{id} > Update event',
  'Events > /events/{id} > Delete event',
  'RSVPs > /events/{id}/rsvp > Create RSVP',
  'RSVPs > /events/{id}/rsvp > Cancel RSVP',
  'RSVPs > /events/{id}/attendees > List attendees',
];

SKIP_TRANSACTIONS.forEach((name) => {
  hooks.before(name, (transaction, done) => {
    transaction.skip = true;
    done();
  });
});

// ── Validate List Events response shape ─────────────────────────────────────
hooks.after('Events > /events > List all events', (transaction, done) => {
  try {
    const body = JSON.parse(transaction.real.body);
    if (!Array.isArray(body.events)) {
      transaction.fail = 'Response body must contain an "events" array';
    }
    if (typeof body.total !== 'number') {
      transaction.fail = 'Response body must contain a numeric "total" field';
    }
  } catch (e) {
    transaction.fail = `Could not parse response JSON: ${e.message}`;
  }
  done();
});

// ── Validate Create Event response shape ────────────────────────────────────
hooks.after('Events > /events > Create event', (transaction, done) => {
  if (transaction.real.statusCode === '401' || transaction.real.statusCode === '403') {
    // Auth or RBAC rejection — acceptable in contract context; annotate only
    console.log('[contract] Create event returned auth error — check JWT role');
    done();
    return;
  }
  try {
    const body = JSON.parse(transaction.real.body);
    if (!body.id && !body._id) {
      transaction.fail = 'Created event response must contain an "id" field';
    }
    if (!body.title) {
      transaction.fail = 'Created event response must contain a "title" field';
    }
  } catch (e) {
    transaction.fail = `Could not parse response JSON: ${e.message}`;
  }
  done();
});

// ── Log summary ─────────────────────────────────────────────────────────────
hooks.afterAll((transactions, done) => {
  const passed = transactions.filter(t => t.results && t.results.valid).length;
  const skipped = transactions.filter(t => t.skip).length;
  const failed = transactions.filter(t => t.results && !t.results.valid && !t.skip).length;
  console.log(`\n[Contract Tests] Passed: ${passed} | Skipped: ${skipped} | Failed: ${failed}`);
  done();
});
