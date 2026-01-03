import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import templateRoutes from './routes/template.route.js';
import notificationRoutes from './routes/notification.route.js';
import preferenceRoutes from './routes/preference.route.js';
import inAppRoutes from './routes/in-app.route.js';
import deviceRoutes from './routes/device.route.js';
import webhookRoutes from './routes/webhook.route.js';
import emailEventRoutes from './routes/email-event.route.js';
import unsubscribeRoutes from './routes/unsubscribe.route.js';

const app: Application = express();
const PORT = process.env.PORT || 3011;

// Swagger/OpenAPI configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Notifications Service API',
      version: '1.0.0',
      description: `
## Overview
The Notifications Service handles all notification-related operations for the e-commerce platform.

## Features
- **Notification Templates**: Create and manage reusable notification templates
- **Multi-channel Delivery**: Send notifications via email, SMS, and push notifications
- **User Preferences**: Manage user notification preferences and opt-outs
- **In-App Notifications**: Handle real-time in-app notification delivery
- **Device Management**: Register and manage push notification devices
- **Webhook Integration**: Process email delivery webhooks from providers
- **Notification History**: Track and query notification delivery history

## Authentication
Most endpoints require JWT authentication via cookie or Authorization header.
      `,
      contact: {
        name: 'API Support',
        email: 'support@innovabound.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Templates',
        description: 'Notification template management - create, update, and manage reusable templates',
      },
      {
        name: 'Notifications',
        description: 'Send and manage notifications across multiple channels (email, SMS, push)',
      },
      {
        name: 'Preferences',
        description: 'User notification preferences and channel opt-in/opt-out settings',
      },
      {
        name: 'In-App',
        description: 'In-app notification operations - real-time notifications within the application',
      },
      {
        name: 'Devices',
        description: 'Device registration for push notifications (mobile and web)',
      },
      {
        name: 'Webhooks',
        description: 'Email provider webhook handlers for delivery status updates',
      },
      {
        name: 'Email Events',
        description: 'Email event tracking and delivery status management',
      },
      {
        name: 'Unsubscribes',
        description: 'Email unsubscribe management and preferences',
      },
      {
        name: 'Health',
        description: 'Service health check endpoints',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'JWT token stored in cookie',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token in Authorization header',
        },
      },
    },
    security: [
      { cookieAuth: [] },
      { bearerAuth: [] },
    ],
  },
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3002", "http://localhost:3003", "http://localhost:3100"],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Notifications Service API Docs',
}));

// OpenAPI JSON spec
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ReDoc
app.get('/redoc', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Notifications Service API - ReDoc</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
        <style>
          body { margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        <redoc spec-url='/api-docs.json'></redoc>
        <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
      </body>
    </html>
  `);
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the notifications service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: notifications-service
 */
// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notifications-service' });
});

// Routes
app.use('/templates', templateRoutes);
app.use('/notifications', notificationRoutes);
app.use('/preferences', preferenceRoutes);
app.use('/in-app', inAppRoutes);
app.use('/devices', deviceRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/email-events', emailEventRoutes);
app.use('/unsubscribes', unsubscribeRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Notifications service running on port ${PORT}`);
  console.log(`📚 API Documentation:`);
  console.log(`   - Swagger UI: http://localhost:${PORT}/api-docs`);
  console.log(`   - OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  console.log(`   - ReDoc: http://localhost:${PORT}/redoc`);
});

export default app;
