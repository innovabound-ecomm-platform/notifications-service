import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, requirePermission, optionalAuth, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  createEmailEventSchema,
  emailEventQuerySchema,
} from '../schemas/notification.schema.js';
import {
  getSiteId,
  emailEventWhere,
  notificationWhere,
} from '../utils/tenant.utils.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

// Record email event (webhook from email provider)
router.post('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createEmailEventSchema.parse(req.body);

    const event = await prisma.emailEvent.create({
      data: {
        ...data,
        actorType: 'SYSTEM',
        createdBy: 'email-provider-webhook',
      },
    });

    // Update notification status based on event type
    if (data.notificationId) {
      const statusMap: Record<string, string> = {
        delivered: 'DELIVERED',
        bounced: 'BOUNCED',
        spam_report: 'SPAM_REPORTED',
      };

      const newStatus = statusMap[data.eventType];
      if (newStatus) {
        await prisma.notification.update({
          where: { id: data.notificationId },
          data: {
            status: newStatus as 'DELIVERED' | 'BOUNCED' | 'SPAM_REPORTED',
            deliveredAt: data.eventType === 'delivered' ? data.occurredAt : undefined,
          },
        });
      }

      // Track engagement
      if (data.eventType === 'opened') {
        await prisma.notification.update({
          where: { id: data.notificationId },
          data: { openedAt: data.occurredAt },
        });
      } else if (data.eventType === 'clicked') {
        await prisma.notification.update({
          where: { id: data.notificationId },
          data: { clickedAt: data.occurredAt },
        });
      }
    }

    // Handle unsubscribe
    if (data.eventType === 'unsubscribed') {
      await prisma.unsubscribe.upsert({
        where: { email: data.email },
        create: {
          email: data.email,
          unsubscribeAll: true,
          reason: 'Email provider unsubscribe',
          createdBy: 'email-provider-webhook',
        },
        update: {
          unsubscribeAll: true,
          reason: 'Email provider unsubscribe',
          updatedBy: 'email-provider-webhook',
        },
      });
    }

    res.status(201).json(event);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error recording email event:', error);
    res.status(500).json({ error: 'Failed to record email event' });
  }
});

// List email events
router.get('/', requireAuth, requirePermission('notifications:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = emailEventQuerySchema.parse(req.query);
    const { page, limit, email, eventType } = query;
    const siteId = getSiteId(req);

    const additionalWhere: Record<string, unknown> = {};
    if (email) additionalWhere.email = email;
    if (eventType) additionalWhere.eventType = eventType;

    const where = emailEventWhere(siteId, additionalWhere, { strict: false });

    const [events, total] = await Promise.all([
      prisma.emailEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { occurredAt: 'desc' },
      }),
      prisma.emailEvent.count({ where }),
    ]);

    res.json({
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing email events:', error);
    res.status(500).json({ error: 'Failed to list email events' });
  }
});

// Get events by message ID
router.get('/message/:messageId', requireAuth, requirePermission('notifications:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const siteId = getSiteId(req);

    const where = emailEventWhere(siteId, { messageId }, { strict: false });

    const events = await prisma.emailEvent.findMany({
      where,
      orderBy: { occurredAt: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Error getting email events:', error);
    res.status(500).json({ error: 'Failed to get email events' });
  }
});

// Get events by notification ID
router.get('/notification/:notificationId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notificationId = parseInt(req.params.notificationId!);
    const siteId = getSiteId(req);

    const notification = await prisma.notification.findFirst({
      where: notificationWhere(siteId, { id: notificationId }, { strict: false }),
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Users can only view events for their own notifications (unless admin)
    if (notification.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const eventsWhere = emailEventWhere(siteId, { notificationId }, { strict: false });

    const events = await prisma.emailEvent.findMany({
      where: eventsWhere,
      orderBy: { occurredAt: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Error getting email events:', error);
    res.status(500).json({ error: 'Failed to get email events' });
  }
});

// Get email statistics
router.get('/stats', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) (where.occurredAt as Record<string, unknown>).gte = new Date(startDate as string);
      if (endDate) (where.occurredAt as Record<string, unknown>).lte = new Date(endDate as string);
    }

    const [
      delivered,
      opened,
      clicked,
      bounced,
      spamReports,
      unsubscribed,
    ] = await Promise.all([
      prisma.emailEvent.count({ where: { ...where, eventType: 'delivered' } }),
      prisma.emailEvent.count({ where: { ...where, eventType: 'opened' } }),
      prisma.emailEvent.count({ where: { ...where, eventType: 'clicked' } }),
      prisma.emailEvent.count({ where: { ...where, eventType: 'bounced' } }),
      prisma.emailEvent.count({ where: { ...where, eventType: 'spam_report' } }),
      prisma.emailEvent.count({ where: { ...where, eventType: 'unsubscribed' } }),
    ]);

    const total = delivered + bounced;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = opened > 0 ? (clicked / opened) * 100 : 0;
    const bounceRate = total > 0 ? (bounced / total) * 100 : 0;
    const spamRate = delivered > 0 ? (spamReports / delivered) * 100 : 0;

    res.json({
      delivered,
      opened,
      clicked,
      bounced,
      spamReports,
      unsubscribed,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
      bounceRate: Math.round(bounceRate * 100) / 100,
      spamRate: Math.round(spamRate * 100) / 100,
    });
  } catch (error) {
    console.error('Error getting email stats:', error);
    res.status(500).json({ error: 'Failed to get email stats' });
  }
});

export default router;
