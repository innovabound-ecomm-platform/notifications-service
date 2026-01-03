import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { config } from "./config/index.js";
import { logger } from "./config/logger.js";
import { AppError } from "./common/errors/AppError.js";

import templateRoutes from "./routes/template.route.js";
import notificationRoutes from "./routes/notification.route.js";
import preferenceRoutes from "./routes/preference.route.js";
import inAppRoutes from "./routes/in-app.route.js";
import deviceRoutes from "./routes/device.route.js";
import webhookRoutes from "./routes/webhook.route.js";
import emailEventRoutes from "./routes/email-event.route.js";
import unsubscribeRoutes from "./routes/unsubscribe.route.js";
import healthRoutes from "./health/health.routes.js";

const app: Application = express();

// Swagger/OpenAPI configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Notifications Service API",
      version: "1.0.0",
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
        name: "API Support",
        email: "support@innovabound.com",
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "Templates",
        description: "Notification template management - create, update, and manage reusable templates",
      },
      {
        name: "Notifications",
        description: "Send and manage notifications across multiple channels (email, SMS, push)",
      },
      {
        name: "Preferences",
        description: "User notification preferences and channel opt-in/opt-out settings",
      },
      {
        name: "In-App",
        description: "In-app notification operations - real-time notifications within the application",
      },
      {
        name: "Devices",
        description: "Device registration for push notifications (mobile and web)",
      },
      {
        name: "Webhooks",
        description: "Email provider webhook handlers for delivery status updates",
      },
      {
        name: "Email Events",
        description: "Email event tracking and delivery status management",
      },
      {
        name: "Unsubscribes",
        description: "Email unsubscribe management and preferences",
      },
      {
        name: "Health",
        description: "Service health check endpoints",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "access_token",
          description: "JWT token stored in cookie",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token in Authorization header",
        },
      },
    },
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts", "./src/routes/*.js", "./src/health/*.ts"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Notifications Service API Docs",
  })
);

// OpenAPI JSON spec
app.get("/api-docs.json", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ReDoc
app.get("/redoc", (req: Request, res: Response) => {
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

// Health routes
app.use("/health", healthRoutes);

// Routes
app.use("/templates", templateRoutes);
app.use("/notifications", notificationRoutes);
app.use("/preferences", preferenceRoutes);
app.use("/in-app", inAppRoutes);
app.use("/devices", deviceRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/email-events", emailEventRoutes);
app.use("/unsubscribes", unsubscribeRoutes);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    logger.error("Application error", {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    path: req.path,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: config.isProduction ? "Internal server error" : err.message,
    },
  });
});

export default app;
