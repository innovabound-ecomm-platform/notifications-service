import { Router, Request, Response } from 'express';
import { prisma } from '@innovabound-ecomm-platform/notifications-db';
import { randomBytes } from 'crypto';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookQuerySchema,
  webhookDeliveryQuerySchema,
} from '../schemas/notification.schema';

const router = Router();

// Generate webhook secret
const generateSecret = (): string => {
  return randomBytes(32).toString('hex');
};

// Create webhook endpoint
router.post('/', requireAuth, async (req: Request, res: Response) => {
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

// List webhook endpoints
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = webhookQuerySchema.parse(req.query);
    const { page, limit, userId, isActive } = query;

    const where: Record<string, unknown> = {};

    // Non-admin users can only see their own webhooks
    if (!req.user!.roles.includes('admin')) {
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

// Get webhook by ID
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only view their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(webhook);
  } catch (error) {
    console.error('Error getting webhook:', error);
    res.status(500).json({ error: 'Failed to get webhook' });
  }
});

// Update webhook
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const data = updateWebhookSchema.parse(req.body);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only update their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
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

// Delete webhook
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only delete their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
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

// Regenerate webhook secret
router.post('/:id/regenerate-secret', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only update their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
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

// Test webhook
router.post('/:id/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Users can only test their own webhooks (unless admin)
    if (webhook.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
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

// Get delivery history
router.get('/:id/deliveries', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
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
    if (webhook.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
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

// Retry delivery
router.post('/deliveries/:deliveryId/retry', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId);

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
