# C4 Context Diagram - Eventify Platform

## System Context

This diagram shows the Eventify Platform in the context of its users and external systems.

```mermaid
C4Context
    title System Context Diagram for Eventify Platform

    Person(user, "Event Attendee", "A person who browses, RSVPs to, and participates in events")
    Person(organizer, "Event Organizer", "A user who creates and manages events")
    Person(admin, "System Admin", "Administers the platform and monitors system health")

    System(eventify, "Eventify Platform", "Enables users to create, discover, and participate in events with real-time communication")

    System_Ext(google, "Google OAuth2", "Provides user authentication")
    System_Ext(smtp, "SMTP Server", "Sends email notifications")
    System_Ext(monitoring, "External Monitoring", "Receives alerts and metrics (optional)")

    Rel(user, eventify, "Browses events, RSVPs, chats", "HTTPS/WebSocket")
    Rel(organizer, eventify, "Creates and manages events", "HTTPS")
    Rel(admin, eventify, "Monitors system health", "HTTPS")

    Rel(eventify, google, "Authenticates users", "OAuth2/HTTPS")
    Rel(eventify, smtp, "Sends notifications", "SMTP")
    Rel(eventify, monitoring, "Sends metrics and alerts", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## External Dependencies

1. **Google OAuth2**: User authentication and profile data
2. **SMTP Server**: Email notifications for event updates and RSVPs
3. **External Monitoring** (Optional): Integration with external monitoring services

## User Types

1. **Event Attendee**: 
   - Browse events
   - RSVP to events
   - Participate in event chats
   - Receive notifications

2. **Event Organizer**: 
   - All attendee capabilities
   - Create events
   - Manage event details
   - View event statistics
   - Manage attendees

3. **System Admin**:
   - Access monitoring dashboards
   - View system metrics
   - Manage system configuration
   - View logs

## System Boundaries

The Eventify Platform boundary includes:
- All microservices
- Internal databases
- Message queues
- Caching layer
- Monitoring infrastructure
- Logging infrastructure

External to the system:
- User devices (browsers, mobile apps)
- OAuth2 providers
- Email services
- External monitoring services
