/**
 * MongoDB Database Initialization Script for Event Service
 * Creates collections, indexes, and sample data
 */

// This script should be run with: node init-db.js
// Or: mongo mongodb://localhost:27017/eventify_events init-db.js

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/eventify_events';

async function initializeDatabase() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();

    // Create events collection with schema validation
    try {
      await db.createCollection('events', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['title', 'date', 'location', 'category', 'creator_id'],
            properties: {
              title: {
                bsonType: 'string',
                minLength: 5,
                maxLength: 200,
                description: 'Event title (5-200 characters)'
              },
              description: {
                bsonType: 'string',
                maxLength: 5000,
                description: 'Event description (optional)'
              },
              date: {
                bsonType: 'date',
                description: 'Event date and time'
              },
              location: {
                bsonType: 'string',
                minLength: 3,
                description: 'Event location'
              },
              category: {
                enum: ['conference', 'workshop', 'meetup', 'webinar', 'social'],
                description: 'Event category'
              },
              max_capacity: {
                bsonType: 'int',
                minimum: 1,
                description: 'Maximum number of attendees'
              },
              current_attendees: {
                bsonType: 'int',
                minimum: 0,
                description: 'Current number of RSVPs'
              },
              creator_id: {
                bsonType: 'string',
                description: 'User ID of event creator'
              },
              created_at: {
                bsonType: 'date',
                description: 'Creation timestamp'
              },
              updated_at: {
                bsonType: 'date',
                description: 'Last update timestamp'
              }
            }
          }
        }
      });
      console.log('✓ Events collection created with schema validation');
    } catch (err) {
      if (err.code === 48) {
        console.log('✓ Events collection already exists');
      } else {
        throw err;
      }
    }

    // Create indexes on events collection
    await db.collection('events').createIndex({ category: 1 });
    await db.collection('events').createIndex({ date: 1 });
    await db.collection('events').createIndex({ creator_id: 1 });
    await db.collection('events').createIndex({ created_at: -1 });
    await db.collection('events').createIndex({ category: 1, date: 1 });
    console.log('✓ Events indexes created');

    // Create RSVPs collection
    try {
      await db.createCollection('rsvps', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['event_id', 'user_id'],
            properties: {
              event_id: {
                bsonType: 'string',
                description: 'Event ID'
              },
              user_id: {
                bsonType: 'string',
                description: 'User ID'
              },
              created_at: {
                bsonType: 'date',
                description: 'RSVP timestamp'
              }
            }
          }
        }
      });
      console.log('✓ RSVPs collection created');
    } catch (err) {
      if (err.code === 48) {
        console.log('✓ RSVPs collection already exists');
      } else {
        throw err;
      }
    }

    // Create indexes on rsvps collection
    await db.collection('rsvps').createIndex({ event_id: 1 });
    await db.collection('rsvps').createIndex({ user_id: 1 });
    await db.collection('rsvps').createIndex({ event_id: 1, user_id: 1 }, { unique: true });
    console.log('✓ RSVPs indexes created');

    // Insert sample events
    const sampleEvents = [
      {
        title: 'Spring Tech Conference 2026',
        description: 'Annual technology conference featuring the latest in software development',
        date: new Date('2026-06-15T09:00:00Z'),
        location: 'Zewail City of Science and Technology',
        category: 'conference',
        max_capacity: 500,
        current_attendees: 0,
        creator_id: 'admin-user-id',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: 'AI/ML Workshop: Building Production Systems',
        description: 'Hands-on workshop on deploying machine learning models',
        date: new Date('2026-05-20T14:00:00Z'),
        location: 'Cairo Innovation Hub',
        category: 'workshop',
        max_capacity: 50,
        current_attendees: 0,
        creator_id: 'organizer-user-id',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: 'React Developers Meetup',
        description: 'Monthly meetup for React enthusiasts',
        date: new Date('2026-05-30T18:00:00Z'),
        location: 'GrEEK Campus',
        category: 'meetup',
        max_capacity: 30,
        current_attendees: 0,
        creator_id: 'organizer-user-id',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    const eventsResult = await db.collection('events').insertMany(sampleEvents);
    console.log(`✓ Inserted ${eventsResult.insertedCount} sample events`);

    // Display summary
    const eventCount = await db.collection('events').countDocuments();
    const rsvpCount = await db.collection('rsvps').countDocuments();

    console.log('\n=== Database Initialization Complete ===');
    console.log(`Total Events: ${eventCount}`);
    console.log(`Total RSVPs: ${rsvpCount}`);
    console.log('Database ready for use!');

  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run if executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
