import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  updatePreferencesSchema,
  updateSinglePreferenceSchema,
  NotificationTypeEnum,
} from '../schemas/notification.schema.js';
import {
  getSiteId,
  notificationPreferenceWhere,
} from '../utils/tenant.utils.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

/**
 * @openapi
 * /preferences/{userId}:
 *   get:
 *     summary: Get user preferences
 *     description: Get notification preferences for a user (users can only view their own unless admin)
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User preferences with defaults for missing types
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to get preferences
 */
router.get('/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only view their own preferences (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const preferences = await prisma.notificationPreference.findMany({
      where: { userId },
    });

    // Return all notification types with defaults for missing ones
    const allTypes = NotificationTypeEnum.options;
    const preferencesMap = new Map(preferences.map(p => [p.notificationType, p]));

    const fullPreferences = allTypes.map(type => ({
      notificationType: type,
      emailEnabled: preferencesMap.get(type)?.emailEnabled ?? true,
      smsEnabled: preferencesMap.get(type)?.smsEnabled ?? false,
      pushEnabled: preferencesMap.get(type)?.pushEnabled ?? true,
      inAppEnabled: preferencesMap.get(type)?.inAppEnabled ?? true,
    }));

    res.json(fullPreferences);
  } catch (error) {
    console.error('Error getting preferences:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * @openapi
 * /preferences/{userId}:
 *   put:
 *     summary: Update preferences (bulk)
 *     description: Update multiple notification preferences at once
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preferences
 *             properties:
 *               preferences:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - notificationType
 *                   properties:
 *                     notificationType:
 *                       type: string
 *                     emailEnabled:
 *                       type: boolean
 *                     smsEnabled:
 *                       type: boolean
 *                     pushEnabled:
 *                       type: boolean
 *                     inAppEnabled:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to update preferences
 */
router.put('/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { preferences } = updatePreferencesSchema.parse(req.body);

    // Users can only update their own preferences (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Upsert each preference
    const results = await Promise.all(
      preferences.map(pref =>
        prisma.notificationPreference.upsert({
          where: {
            userId_notificationType: {
              userId: userId!,
              notificationType: pref.notificationType,
            },
          },
          create: {
            userId: userId!,
            notificationType: pref.notificationType,
            emailEnabled: pref.emailEnabled ?? true,
            smsEnabled: pref.smsEnabled ?? false,
            pushEnabled: pref.pushEnabled ?? true,
            inAppEnabled: pref.inAppEnabled ?? true,
            createdBy: req.user!.userId,
            updatedBy: req.user!.userId,
          },
          update: {
            emailEnabled: pref.emailEnabled,
            smsEnabled: pref.smsEnabled,
            pushEnabled: pref.pushEnabled,
            inAppEnabled: pref.inAppEnabled,
            updatedBy: req.user!.userId,
          },
        })
      )
    );

    res.json(results);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @openapi
 * /preferences/{userId}/{type}:
 *   put:
 *     summary: Update single preference
 *     description: Update notification preference for a specific notification type
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification type (e.g., ORDER_CONFIRMATION)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailEnabled:
 *                 type: boolean
 *               smsEnabled:
 *                 type: boolean
 *               pushEnabled:
 *                 type: boolean
 *               inAppEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preference updated successfully
 *       400:
 *         description: Validation error or invalid notification type
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to update preference
 */
router.put('/:userId/:type', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, type } = req.params;
    const data = updateSinglePreferenceSchema.parse(req.body);

    // Users can only update their own preferences (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Validate notification type
    const validType = NotificationTypeEnum.safeParse(type);
    if (!validType.success) {
      res.status(400).json({ error: 'Invalid notification type' });
      return;
    }

    const preference = await prisma.notificationPreference.upsert({
      where: {
        userId_notificationType: {
          userId: userId!,
          notificationType: validType.data,
        },
      },
      create: {
        userId: userId!,
        notificationType: validType.data,
        emailEnabled: data.emailEnabled ?? true,
        smsEnabled: data.smsEnabled ?? false,
        pushEnabled: data.pushEnabled ?? true,
        inAppEnabled: data.inAppEnabled ?? true,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
      update: {
        ...data,
        updatedBy: req.user!.userId,
      },
    });

    res.json(preference);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error updating preference:', error);
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

/**
 * @openapi
 * /preferences/{userId}:
 *   delete:
 *     summary: Delete all preferences
 *     description: Delete all notification preferences for a user (resets to defaults)
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       204:
 *         description: Preferences deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to delete preferences
 */
router.delete('/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only delete their own preferences (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.notificationPreference.deleteMany({
      where: { userId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting preferences:', error);
    res.status(500).json({ error: 'Failed to delete preferences' });
  }
});

export default router;
