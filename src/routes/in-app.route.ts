import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  createInAppNotificationSchema,
  inAppQuerySchema,
} from '../schemas/notification.schema.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

/**
 * @openapi
 * /in-app:
 *   post:
 *     summary: Create in-app notification
 *     description: Create a new in-app notification for a user
 *     tags:
 *       - In-App Notifications
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
 *               - userId
 *               - notificationType
 *               - title
 *             properties:
 *               userId:
 *                 type: string
 *               notificationType:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               actionUrl:
 *                 type: string
 *               actionLabel:
 *                 type: string
 *               icon:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: In-app notification created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create in-app notification
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

/**
 * @openapi
 * /in-app/{userId}:
 *   get:
 *     summary: Get user's in-app notifications
 *     description: Get paginated in-app notifications for a user
 *     tags:
 *       - In-App Notifications
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
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: read
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: notificationType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of in-app notifications
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to get in-app notifications
 */
router.get('/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const query = inAppQuerySchema.parse(req.query);
    const { page, limit, read, notificationType } = query;

    // Users can only view their own notifications (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /in-app/{userId}/unread-count:
 *   get:
 *     summary: Get unread count
 *     description: Get count of unread in-app notifications for a user
 *     tags:
 *       - In-App Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unread notification count
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to get unread count
 */
router.get('/:userId/unread-count', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only view their own notifications (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /in-app/{id}/read:
 *   post:
 *     summary: Mark as read
 *     description: Mark an in-app notification as read
 *     tags:
 *       - In-App Notifications
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
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Failed to mark as read
 */
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const notification = await prisma.inAppNotification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Users can only update their own notifications (unless admin)
    if (notification.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /in-app/{id}/dismiss:
 *   post:
 *     summary: Dismiss notification
 *     description: Dismiss an in-app notification
 *     tags:
 *       - In-App Notifications
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
 *         description: Notification dismissed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Failed to dismiss notification
 */
router.post('/:id/dismiss', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const notification = await prisma.inAppNotification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Users can only update their own notifications (unless admin)
    if (notification.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /in-app/{userId}/read-all:
 *   post:
 *     summary: Mark all as read
 *     description: Mark all unread in-app notifications as read for a user
 *     tags:
 *       - In-App Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to mark all as read
 */
router.post('/:userId/read-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only update their own notifications (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /in-app/{userId}/dismiss-all:
 *   post:
 *     summary: Dismiss all notifications
 *     description: Dismiss all in-app notifications for a user
 *     tags:
 *       - In-App Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All notifications dismissed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to dismiss all
 */
router.post('/:userId/dismiss-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only update their own notifications (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /in-app/cleanup:
 *   delete:
 *     summary: Cleanup old notifications
 *     description: Delete expired and old dismissed notifications (admin only)
 *     tags:
 *       - In-App Notifications
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: daysOld
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Delete dismissed notifications older than this many days
 *     responses:
 *       200:
 *         description: Cleanup completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       500:
 *         description: Failed to clean up notifications
 */
router.delete('/cleanup', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAdmin(req.user!.roles)) {
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
