import { Router, Request, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  createUnsubscribeSchema,
  updateUnsubscribeSchema,
} from '../schemas/notification.schema.js';

const router = Router();
const prisma = getNotificationsPrisma();

// Unsubscribe email (can be anonymous for one-click unsubscribe)
router.post('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const data = createUnsubscribeSchema.parse(req.body);

    const unsubscribe = await prisma.unsubscribe.upsert({
      where: { email: data.email },
      create: {
        ...data,
        createdBy: req.user?.userId || 'anonymous',
        updatedBy: req.user?.userId || 'anonymous',
      },
      update: {
        unsubscribeAll: data.unsubscribeAll,
        categories: data.categories,
        reason: data.reason,
        userId: data.userId,
        updatedBy: req.user?.userId || 'anonymous',
      },
    });

    res.status(201).json(unsubscribe);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error creating unsubscribe:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Check unsubscribe status
router.get('/:email', requireAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    const unsubscribe = await prisma.unsubscribe.findUnique({
      where: { email },
    });

    if (!unsubscribe) {
      res.json({
        email,
        unsubscribed: false,
        unsubscribeAll: false,
        categories: [],
      });
      return;
    }

    res.json({
      unsubscribed: true,
      ...unsubscribe,
    });
  } catch (error) {
    console.error('Error checking unsubscribe status:', error);
    res.status(500).json({ error: 'Failed to check unsubscribe status' });
  }
});

// Update unsubscribe
router.put('/:email', requireAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const data = updateUnsubscribeSchema.parse(req.body);

    const unsubscribe = await prisma.unsubscribe.update({
      where: { email },
      data: {
        ...data,
        updatedBy: req.user!.userId,
      },
    });

    res.json(unsubscribe);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error updating unsubscribe:', error);
    res.status(500).json({ error: 'Failed to update unsubscribe' });
  }
});

// Resubscribe (delete unsubscribe)
router.delete('/:email', requireAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    await prisma.unsubscribe.delete({
      where: { email },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error resubscribing:', error);
    res.status(500).json({ error: 'Failed to resubscribe' });
  }
});

// Bulk check unsubscribe status
router.post('/check', requireAuth, async (req: Request, res: Response) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'Emails array is required' });
      return;
    }

    if (emails.length > 100) {
      res.status(400).json({ error: 'Maximum 100 emails per request' });
      return;
    }

    const unsubscribes = await prisma.unsubscribe.findMany({
      where: { email: { in: emails } },
    });

    const unsubscribeMap = new Map(unsubscribes.map(u => [u.email, u]));

    const results = emails.map(email => {
      const unsub = unsubscribeMap.get(email);
      return {
        email,
        unsubscribed: !!unsub,
        unsubscribeAll: unsub?.unsubscribeAll || false,
        categories: unsub?.categories || [],
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error checking unsubscribes:', error);
    res.status(500).json({ error: 'Failed to check unsubscribes' });
  }
});

// Check if email can receive specific notification type
router.get('/:email/can-send/:type', requireAuth, async (req: Request, res: Response) => {
  try {
    const { email, type } = req.params;

    const unsubscribe = await prisma.unsubscribe.findUnique({
      where: { email },
    });

    if (!unsubscribe) {
      res.json({ canSend: true, reason: null });
      return;
    }

    if (unsubscribe.unsubscribeAll) {
      res.json({ canSend: false, reason: 'unsubscribed_all' });
      return;
    }

    if (unsubscribe.categories.includes(type as never)) {
      res.json({ canSend: false, reason: 'unsubscribed_category' });
      return;
    }

    res.json({ canSend: true, reason: null });
  } catch (error) {
    console.error('Error checking if can send:', error);
    res.status(500).json({ error: 'Failed to check send permission' });
  }
});

// List all unsubscribes (admin)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [unsubscribes, total] = await Promise.all([
      prisma.unsubscribe.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.unsubscribe.count(),
    ]);

    res.json({
      data: unsubscribes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing unsubscribes:', error);
    res.status(500).json({ error: 'Failed to list unsubscribes' });
  }
});

export default router;
