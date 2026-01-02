import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, requirePermission, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  createNotificationSchema,
  notificationQuerySchema,
} from '../schemas/notification.schema.js';

const router = Router();
const prisma = getNotificationsPrisma();

// Create/send notification
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createNotificationSchema.parse(req.body);

    // If template is specified, render the template
    let renderedContent: {
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      bodyJson?: Record<string, unknown>;
    } = {};

    if (data.templateId) {
      const template = await prisma.notificationTemplate.findUnique({
        where: { id: data.templateId },
      });

      if (template) {
        // Simple variable substitution (in production, use a proper template engine)
        const context = data.contextData || {};
        
        const renderTemplate = (text: string | null): string | undefined => {
          if (!text) return undefined;
          return text.replace(/\{\{(\w+)\}\}/g, (_, key) => 
            String(context[key as keyof typeof context] || `{{${key}}}`)
          );
        };

        renderedContent = {
          subject: renderTemplate(template.subject),
          bodyHtml: renderTemplate(template.bodyHtml),
          bodyText: renderTemplate(template.bodyText),
          bodyJson: template.bodyJson as Record<string, unknown> | undefined,
        };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        siteId: data.siteId,
        userId: data.userId,
        email: data.email,
        phone: data.phone,
        deviceToken: data.deviceToken,
        notificationType: data.notificationType,
        channel: data.channel,
        templateId: data.templateId,
        subject: data.subject || renderedContent.subject,
        bodyHtml: data.bodyHtml || renderedContent.bodyHtml,
        bodyText: data.bodyText || renderedContent.bodyText,
        bodyJson: data.bodyJson || renderedContent.bodyJson,
        contextData: data.contextData,
        correlationId: data.correlationId,
        orderId: data.orderId,
        paymentId: data.paymentId,
        returnId: data.returnId,
        subscriptionId: data.subscriptionId,
        customerId: data.customerId,
        productId: data.productId,
        cartId: data.cartId,
        priority: data.priority,
        scheduledFor: data.scheduledFor,
        status: data.scheduledFor ? 'PENDING' : 'QUEUED',
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    // In production, this would trigger the actual send via Kafka
    // await kafkaClient.send('notification.send', { notificationId: notification.id });

    res.status(201).json(notification);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// List notifications
router.get('/', requireAuth, requirePermission('notifications:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = notificationQuerySchema.parse(req.query);
    const { page, limit, status, notificationType, channel, userId, orderId, correlationId } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (notificationType) where.notificationType = notificationType;
    if (channel) where.channel = channel;
    if (userId) where.userId = userId;
    if (orderId) where.orderId = orderId;
    if (correlationId) where.correlationId = correlationId;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing notifications:', error);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// Get notification by ID
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Users can only view their own notifications (unless admin)
    if (notification.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(notification);
  } catch (error) {
    console.error('Error getting notification:', error);
    res.status(500).json({ error: 'Failed to get notification' });
  }
});

// Get user's notifications
router.get('/user/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const query = notificationQuerySchema.parse(req.query);
    const { page, limit, status, notificationType, channel } = query;

    // Users can only view their own notifications (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (notificationType) where.notificationType = notificationType;
    if (channel) where.channel = channel;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error getting user notifications:', error);
    res.status(500).json({ error: 'Failed to get user notifications' });
  }
});

// Retry failed notification
router.post('/:id/retry', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.status !== 'FAILED') {
      res.status(400).json({ error: 'Only failed notifications can be retried' });
      return;
    }

    if (notification.retryCount >= notification.maxRetries) {
      res.status(400).json({ error: 'Maximum retry attempts exceeded' });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        status: 'QUEUED',
        retryCount: { increment: 1 },
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        updatedBy: req.user!.userId,
      },
    });

    // In production, this would trigger the actual send via Kafka
    // await kafkaClient.send('notification.send', { notificationId: notification.id });

    res.json(updated);
  } catch (error) {
    console.error('Error retrying notification:', error);
    res.status(500).json({ error: 'Failed to retry notification' });
  }
});

// Cancel pending notification
router.post('/:id/cancel', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (!['PENDING', 'QUEUED'].includes(notification.status)) {
      res.status(400).json({ error: 'Only pending or queued notifications can be cancelled' });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage: 'Cancelled by user',
        failedAt: new Date(),
        updatedBy: req.user!.userId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error cancelling notification:', error);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

// Update notification status (internal use for workers)
router.patch('/:id/status', requireAuth, requirePermission('system'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const { status, errorCode, errorMessage, providerMessageId, provider } = req.body;

    const updateData: Record<string, unknown> = {
      status,
      updatedBy: req.user!.userId,
    };

    if (status === 'SENT') {
      updateData.sentAt = new Date();
    } else if (status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    } else if (status === 'FAILED') {
      updateData.failedAt = new Date();
      updateData.errorCode = errorCode;
      updateData.errorMessage = errorMessage;
    }

    if (providerMessageId) updateData.providerMessageId = providerMessageId;
    if (provider) updateData.provider = provider;

    const notification = await prisma.notification.update({
      where: { id },
      data: updateData,
    });

    res.json(notification);
  } catch (error) {
    console.error('Error updating notification status:', error);
    res.status(500).json({ error: 'Failed to update notification status' });
  }
});

// Bulk send notifications
router.post('/bulk', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notifications } = req.body;

    if (!Array.isArray(notifications) || notifications.length === 0) {
      res.status(400).json({ error: 'Notifications array is required' });
      return;
    }

    if (notifications.length > 100) {
      res.status(400).json({ error: 'Maximum 100 notifications per batch' });
      return;
    }

    const validatedNotifications = notifications.map(n => createNotificationSchema.parse(n));

    const created = await prisma.notification.createMany({
      data: validatedNotifications.map(n => ({
        ...n,
        status: n.scheduledFor ? 'PENDING' : 'QUEUED',
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      })),
    });

    res.status(201).json({
      message: `${created.count} notifications created`,
      count: created.count,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error creating bulk notifications:', error);
    res.status(500).json({ error: 'Failed to create bulk notifications' });
  }
});

export default router;
