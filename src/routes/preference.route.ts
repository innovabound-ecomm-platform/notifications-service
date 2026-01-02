import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  updatePreferencesSchema,
  updateSinglePreferenceSchema,
  NotificationTypeEnum,
} from '../schemas/notification.schema.js';

const router = Router();
const prisma = getNotificationsPrisma();

// Get user preferences
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

// Update user preferences (bulk)
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

// Update single preference
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

// Delete all preferences for a user
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
