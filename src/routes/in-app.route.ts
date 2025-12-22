import { Router, Request, Response } from 'express';
import { prisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth } from '../middleware/auth';
import {
  createInAppNotificationSchema,
  inAppQuerySchema,
} from '../schemas/notification.schema';

const router = Router();

// Create in-app notification
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createInAppNotificationSchema.parse(req.body);

    const notification = await prisma.inAppNotification.create({
      data: {
        ...data,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(notification);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error creating in-app notification:', error);
    res.status(500).json({ error: 'Failed to create in-app notification' });
  }
});

// Get user's in-app notifications
router.get('/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const query = inAppQuerySchema.parse(req.query);
    const { page, limit, read, notificationType } = query;

    // Users can only view their own notifications (unless admin)
    if (userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const where: Record<string, unknown> = {
      userId,
      dismissed: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    };

    if (read !== undefined) where.read = read;
    if (notificationType) where.notificationType = notificationType;

    const [notifications, total] = await Promise.all([
      prisma.inAppNotification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inAppNotification.count({ where }),
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
    console.error('Error getting in-app notifications:', error);
    res.status(500).json({ error: 'Failed to get in-app notifications' });
  }
});

// Get unread count
router.get('/:userId/unread-count', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only view their own notifications (unless admin)
    if (userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const count = await prisma.inAppNotification.count({
      where: {
        userId,
        read: false,
        dismissed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark as read
router.post('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const notification = await prisma.inAppNotification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Users can only update their own notifications (unless admin)
    if (notification.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.inAppNotification.update({
      where: { id },
      data: {
        read: true,
        readAt: new Date(),
        updatedBy: req.user!.userId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Dismiss notification
router.post('/:id/dismiss', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const notification = await prisma.inAppNotification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Users can only update their own notifications (unless admin)
    if (notification.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.inAppNotification.update({
      where: { id },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
        updatedBy: req.user!.userId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

// Mark all as read
router.post('/:userId/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only update their own notifications (unless admin)
    if (userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await prisma.inAppNotification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    res.json({ message: `${result.count} notifications marked as read` });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Dismiss all
router.post('/:userId/dismiss-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only update their own notifications (unless admin)
    if (userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await prisma.inAppNotification.updateMany({
      where: {
        userId,
        dismissed: false,
      },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
      },
    });

    res.json({ message: `${result.count} notifications dismissed` });
  } catch (error) {
    console.error('Error dismissing all:', error);
    res.status(500).json({ error: 'Failed to dismiss all' });
  }
});

// Delete old notifications (admin cleanup)
router.delete('/cleanup', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const daysOld = parseInt(req.query.daysOld as string) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.inAppNotification.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            dismissed: true,
            dismissedAt: { lt: cutoffDate },
          },
        ],
      },
    });

    res.json({ message: `${result.count} notifications deleted` });
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
    res.status(500).json({ error: 'Failed to clean up notifications' });
  }
});

export default router;
