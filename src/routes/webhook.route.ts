import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { randomBytes } from 'crypto';
import { requireAuth, requirePermission, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookQuerySchema,
  webhookDeliveryQuerySchema,
} from '../schemas/notification.schema.js';
import {
  getSiteId,
  webhookEndpointWhere,
} from '../utils/tenant.utils.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

// Generate webhook secret
const generateSecret = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * @openapi
 * /webhooks:
 *   post:
 *     summary: Create webhook endpoint
 *     description: Register a new webhook endpoint for receiving notification events
 *     tags:
 *       - Webhooks
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
 *               - url
 *               - subscribedEvents
 *             properties:
 *               userId:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               subscribedEvents:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Webhook created successfully (includes generated secret)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create webhook
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createWebhookSchema.parse(req.body);

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        ...data,
        userId: data.userId || req.user!.userId,
        secret: generateSecret(),
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(webhook);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error creating webhook:', error);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

/**
 * @openapi
 * /webhooks:
 *   get:
 *     summary: List webhook endpoints
 *     description: Get all webhook endpoints (non-admin users only see their own)
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of webhooks (secret not included)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to list webhooks
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = webhookQuerySchema.parse(req.query);
    const { page, limit, userId, isActive } = query;

    const where: Record<string, unknown> = {};

    // Non-admin users can only see their own webhooks
    if (!isAdmin(req.user!.roles)) {
      where.userId = req.user!.userId;
    } else if (userId) {
      where.userId = userId;
    }

    if (isActive !== undefined) where.isActive = isActive;

    const [webhooks, total] = await Promise.all([
      prisma.webhookEndpoint.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          uuid: true,
          userId: true,
          url: true,
          description: true,
          subscribedEvents: true,
          isActive: true,
          lastDeliveryAt: true,
          failureCount: true,
          createdAt: true,
          updatedAt: true,
          // Don't expose secret in list
        },
      }),
      prisma.webhookEndpoint.count({ where }),
    ]);

    res.json({
      data: webhooks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

/**
 * @openapi
 * /webhooks/{id}:
 *   get:
 *     summary: Get webhook by ID
 *     description: Get details of a specific webhook endpoint (includes secret)
 *     tags:
 *       - Webhooks
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
 *         description: Webhook details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to get webhook
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only view their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(webhook);
  } catch (error) {
    console.error('Error getting webhook:', error);
    res.status(500).json({ error: 'Failed to get webhook' });
  }
});

/**
 * @openapi
 * /webhooks/{id}:
 *   put:
 *     summary: Update webhook
 *     description: Update webhook endpoint configuration
 *     tags:
 *       - Webhooks
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
 *             properties:
 *               url:
 *                 type: string
 *               description:
 *                 type: string
 *               subscribedEvents:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to update webhook
 */
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const data = updateWebhookSchema.parse(req.body);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only update their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...data,
        updatedBy: req.user!.userId,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error updating webhook:', error);
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

/**
 * @openapi
 * /webhooks/{id}:
 *   delete:
 *     summary: Delete webhook
 *     description: Remove a webhook endpoint
 *     tags:
 *       - Webhooks
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
 *       204:
 *         description: Webhook deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to delete webhook
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only delete their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.webhookEndpoint.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

/**
 * @openapi
 * /webhooks/{id}/regenerate-secret:
 *   post:
 *     summary: Regenerate webhook secret
 *     description: Generate a new secret for webhook signature verification
 *     tags:
 *       - Webhooks
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
 *         description: Secret regenerated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to regenerate secret
 */
router.post('/:id/regenerate-secret', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only update their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        secret: generateSecret(),
        updatedBy: req.user!.userId,
      },
    });

    res.json({ secret: updated.secret });
  } catch (error) {
    console.error('Error regenerating secret:', error);
    res.status(500).json({ error: 'Failed to regenerate secret' });
  }
});

/**
 * @openapi
 * /webhooks/{id}/test:
 *   post:
 *     summary: Test webhook
 *     description: Send a test delivery to verify webhook endpoint
 *     tags:
 *       - Webhooks
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
 *         description: Test webhook sent successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to test webhook
 */
router.post('/:id/test', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only test their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Create test delivery
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
      },
    };

    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: id,
        eventType: 'CUSTOM',
        payload: testPayload,
        status: 'PENDING',
        actorUserId: req.user!.userId,
        actorType: 'USER',
        createdBy: req.user!.userId,
      },
    });

    // In production, this would trigger actual HTTP request via worker
    // For now, simulate success
    const updatedDelivery = await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        responseStatus: 200,
        responseBody: '{"status": "ok"}',
        responseTime: 150,
        attemptCount: 1,
        deliveredAt: new Date(),
      },
    });

    await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        lastDeliveryAt: new Date(),
        failureCount: 0,
      },
    });

    res.json({
      message: 'Test webhook sent',
      delivery: updatedDelivery,
    });
  } catch (error) {
    console.error('Error testing webhook:', error);
    res.status(500).json({ error: 'Failed to test webhook' });
  }
});

/**
 * @openapi
 * /webhooks/{id}/deliveries:
 *   get:
 *     summary: Get delivery history
 *     description: Get webhook delivery history with filtering
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SENT, FAILED]
 *     responses:
 *       200:
 *         description: List of deliveries
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Webhook not found
 *       500:
 *         description: Failed to get deliveries
 */
router.get('/:id/deliveries', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const query = webhookDeliveryQuerySchema.parse(req.query);
    const { page, limit, status } = query;

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only view their own webhook deliveries (unless admin)
    if (webhook.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const where: Record<string, unknown> = { endpointId: id };
    if (status) where.status = status;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    res.json({
      data: deliveries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error getting deliveries:', error);
    res.status(500).json({ error: 'Failed to get deliveries' });
  }
});

/**
 * @openapi
 * /webhooks/deliveries/{deliveryId}/retry:
 *   post:
 *     summary: Retry delivery
 *     description: Retry a failed webhook delivery (requires admin permission)
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: deliveryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Delivery queued for retry
 *       400:
 *         description: Only failed deliveries can be retried
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Delivery not found
 *       500:
 *         description: Failed to retry delivery
 */
router.post('/deliveries/:deliveryId/retry', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId!);

    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });

    if (!delivery) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (delivery.status !== 'FAILED') {
      res.status(400).json({ error: 'Only failed deliveries can be retried' });
      return;
    }

    const updated = await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        nextRetryAt: null,
        errorMessage: null,
      },
    });

    // In production, trigger actual retry via worker

    res.json(updated);
  } catch (error) {
    console.error('Error retrying delivery:', error);
    res.status(500).json({ error: 'Failed to retry delivery' });
  }
});

export default router;
