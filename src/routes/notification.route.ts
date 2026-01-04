import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, requirePermission, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  createNotificationSchema,
  notificationQuerySchema,
} from '../schemas/notification.schema.js';
import {
  getSiteId,
  notificationWhere,
  withSiteId,
  validateTenantOwnership,
} from '../utils/tenant.utils.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

/**
 * @openapi
 * /notifications:
 *   post:
 *     summary: Create/send notification
 *     description: Create and queue a notification for delivery
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - notificationType
 *               - channel
 *             properties:
 *               siteId:
 *                 type: string
 *               userId:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               deviceToken:
 *                 type: string
 *               notificationType:
 *                 type: string
 *                 enum: [ORDER_CONFIRMATION, SHIPPING_UPDATE, DELIVERY_NOTIFICATION, etc.]
 *               channel:
 *                 type: string
 *                 enum: [EMAIL, SMS, PUSH, IN_APP]
 *               templateId:
 *                 type: integer
 *               subject:
 *                 type: string
 *               bodyHtml:
 *                 type: string
 *               bodyText:
 *                 type: string
 *               bodyJson:
 *                 type: object
 *               contextData:
 *                 type: object
 *               correlationId:
 *                 type: string
 *               orderId:
 *                 type: string
 *               paymentId:
 *                 type: string
 *               returnId:
 *                 type: string
 *               subscriptionId:
 *                 type: string
 *               customerId:
 *                 type: string
 *               productId:
 *                 type: string
 *               cartId:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: NORMAL
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Notification created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createNotificationSchema.parse(req.body);
    const siteId = getSiteId(req);

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
        siteId: data.siteId || siteId,
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

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List notifications
 *     description: List all notifications with filtering and pagination (requires notifications:read permission)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, QUEUED, SENT, DELIVERED, FAILED, BOUNCED, SPAM_REPORTED]
 *       - in: query
 *         name: notificationType
 *         schema:
 *           type: string
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *           enum: [EMAIL, SMS, PUSH, IN_APP]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: orderId
 *         schema:
 *           type: string
 *       - in: query
 *         name: correlationId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification list with pagination
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - missing permissions
 *       500:
 *         description: Server error
 */
router.get('/', requireAuth, requirePermission('notifications:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = notificationQuerySchema.parse(req.query);
    const { page, limit, status, notificationType, channel, userId, orderId, correlationId } = query;
    const siteId = getSiteId(req);

    const additionalWhere: Record<string, unknown> = {};
    if (status) additionalWhere.status = status;
    if (notificationType) additionalWhere.notificationType = notificationType;
    if (channel) additionalWhere.channel = channel;
    if (userId) additionalWhere.userId = userId;
    if (orderId) additionalWhere.orderId = orderId;
    if (correlationId) additionalWhere.correlationId = correlationId;

    const where = notificationWhere(siteId, additionalWhere, { strict: false });

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

/**
 * @openapi
 * /notifications/{id}:
 *   get:
 *     summary: Get notification by ID
 *     description: Retrieve a single notification (users can only view their own)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification retrieved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const siteId = getSiteId(req);

    const notification = await prisma.notification.findFirst({
      where: notificationWhere(siteId, { id }, { strict: false }),
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

/**
 * @openapi
 * /notifications/user/{userId}:
 *   get:
 *     summary: Get user's notifications
 *     description: Get all notifications for a specific user (users can only view their own unless admin)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: notificationType
 *         schema:
 *           type: string
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User notifications with pagination
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get('/user/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const query = notificationQuerySchema.parse(req.query);
    const { page, limit, status, notificationType, channel } = query;
    const siteId = getSiteId(req);

    // Users can only view their own notifications (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const additionalWhere: Record<string, unknown> = { userId };
    if (status) additionalWhere.status = status;
    if (notificationType) additionalWhere.notificationType = notificationType;
    if (channel) additionalWhere.channel = channel;

    const where = notificationWhere(siteId, additionalWhere, { strict: false });

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

/**
 * @openapi
 * /notifications/{id}/retry:
 *   post:
 *     summary: Retry failed notification
 *     description: Re-queue a failed notification for delivery
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification retried
 *       400:
 *         description: Cannot retry (not failed or max retries exceeded)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - missing permissions
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.post('/:id/retry', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const siteId = getSiteId(req);

    const notification = await prisma.notification.findFirst({
      where: notificationWhere(siteId, { id }, { strict: false }),
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

/**
 * @openapi
 * /notifications/{id}/cancel:
 *   post:
 *     summary: Cancel pending notification
 *     description: Cancel a pending or queued notification
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification cancelled
 *       400:
 *         description: Cannot cancel (not pending or queued)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - missing permissions
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.post('/:id/cancel', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const siteId = getSiteId(req);

    const notification = await prisma.notification.findFirst({
      where: notificationWhere(siteId, { id }, { strict: false }),
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

/**
 * @openapi
 * /notifications/{id}/status:
 *   patch:
 *     summary: Update notification status
 *     description: Update notification delivery status (internal use for workers)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [SENT, DELIVERED, FAILED]
 *               errorCode:
 *                 type: string
 *               errorMessage:
 *                 type: string
 *               providerMessageId:
 *                 type: string
 *               provider:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires system permission
 *       500:
 *         description: Server error
 */
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

/**
 * @openapi
 * /notifications/bulk:
 *   post:
 *     summary: Bulk send notifications
 *     description: Create and queue multiple notifications in a single request (max 100)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - notifications
 *             properties:
 *               notifications:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Notifications created
 *       400:
 *         description: Validation error or too many notifications
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - missing permissions
 *       500:
 *         description: Server error
 */
router.post('/bulk', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notifications } = req.body;
    const siteId = getSiteId(req);

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
        siteId: n.siteId || siteId,
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
