import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import templateRoutes from './routes/template.route.js';
import notificationRoutes from './routes/notification.route.js';
import preferenceRoutes from './routes/preference.route.js';
import inAppRoutes from './routes/in-app.route.js';
import deviceRoutes from './routes/device.route.js';
import webhookRoutes from './routes/webhook.route.js';
import emailEventRoutes from './routes/email-event.route.js';
import unsubscribeRoutes from './routes/unsubscribe.route.js';

const app = express();
const PORT = process.env.PORT || 3012;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

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
});

export default app;
