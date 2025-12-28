# Notifications Service

Notification management service for the e-commerce platform.

## Features

- **Notification Templates**: Create and manage email, SMS, push, in-app templates
- **Template Versioning**: Version control with approval workflows
- **Multi-channel Delivery**: Email, SMS, push, in-app, webhook notifications
- **Localization**: Template localization for multiple locales
- **User Preferences**: Per-user notification channel preferences
- **In-App Notifications**: In-app notification management with read/dismiss
- **Push Devices**: Device registration for push notifications
- **Webhooks**: Webhook endpoint management and delivery tracking
- **Email Events**: Email open, click, bounce tracking
- **Unsubscribe Management**: Email unsubscribe handling

## API Endpoints

### Templates
- `POST /templates` - Create notification template
- `GET /templates` - List templates
- `GET /templates/:id` - Get template by ID
- `GET /templates/slug/:slug` - Get template by slug
- `PUT /templates/:id` - Update template
- `DELETE /templates/:id` - Delete template
- `POST /templates/:id/activate` - Activate template
- `POST /templates/:id/archive` - Archive template

### Template Versions
- `POST /templates/:id/versions` - Create new version
- `GET /templates/:id/versions` - List versions
- `GET /templates/:id/versions/:versionId` - Get specific version
- `POST /templates/:id/versions/:versionId/submit` - Submit for approval
- `POST /templates/:id/versions/:versionId/approve` - Approve version
- `POST /templates/:id/versions/:versionId/reject` - Reject version
- `POST /templates/:id/versions/:versionId/activate` - Activate version

### Template Localizations
- `POST /templates/:id/localizations` - Add localization
- `GET /templates/:id/localizations` - List localizations
- `PUT /templates/:id/localizations/:locale` - Update localization
- `DELETE /templates/:id/localizations/:locale` - Delete localization

### Notifications
- `POST /notifications` - Create/send notification
- `GET /notifications` - List notifications
- `GET /notifications/:id` - Get notification by ID
- `POST /notifications/:id/retry` - Retry failed notification
- `POST /notifications/:id/cancel` - Cancel pending notification
- `GET /notifications/user/:userId` - Get user's notifications

### User Preferences
- `GET /preferences/:userId` - Get user preferences
- `PUT /preferences/:userId` - Update user preferences
- `PUT /preferences/:userId/:type` - Update specific preference

### In-App Notifications
- `GET /in-app/:userId` - Get user's in-app notifications
- `GET /in-app/:userId/unread-count` - Get unread count
- `POST /in-app/:id/read` - Mark as read
- `POST /in-app/:id/dismiss` - Dismiss notification
- `POST /in-app/:userId/read-all` - Mark all as read
- `POST /in-app/:userId/dismiss-all` - Dismiss all

### Push Devices
- `POST /devices` - Register push device
- `GET /devices/user/:userId` - Get user's devices
- `PUT /devices/:id` - Update device
- `DELETE /devices/:id` - Remove device
- `POST /devices/:id/activate` - Activate device
- `POST /devices/:id/deactivate` - Deactivate device

### Webhooks
- `POST /webhooks` - Create webhook endpoint
- `GET /webhooks` - List webhook endpoints
- `GET /webhooks/:id` - Get webhook by ID
- `PUT /webhooks/:id` - Update webhook
- `DELETE /webhooks/:id` - Delete webhook
- `POST /webhooks/:id/test` - Test webhook
- `GET /webhooks/:id/deliveries` - Get delivery history

### Email Events
- `POST /email-events` - Record email event (webhook from provider)
- `GET /email-events` - List email events
- `GET /email-events/message/:messageId` - Get events by message ID

### Unsubscribes
- `POST /unsubscribes` - Unsubscribe email
- `GET /unsubscribes/:email` - Check unsubscribe status
- `PUT /unsubscribes/:email` - Update unsubscribe
- `DELETE /unsubscribes/:email` - Resubscribe

## Running the Service

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## Environment Variables

- `PORT` - Server port (default: 3011)
- `DATABASE_URL` - PostgreSQL connection string

## Port

This service runs on port `3011`.
