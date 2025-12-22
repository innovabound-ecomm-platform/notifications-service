import { Router, Request, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth } from '../middleware/auth.js';
import {
  registerDeviceSchema,
  updateDeviceSchema,
} from '../schemas/notification.schema.js';

const router = Router();
const prisma = getNotificationsPrisma();

// Register push device
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = registerDeviceSchema.parse(req.body);

    // Users can only register devices for themselves (unless admin)
    if (data.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Upsert device (update if token already exists)
    const device = await prisma.pushDevice.upsert({
      where: { deviceToken: data.deviceToken },
      create: {
        ...data,
        isActive: true,
        lastUsedAt: new Date(),
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
      update: {
        userId: data.userId,
        platform: data.platform,
        deviceName: data.deviceName,
        provider: data.provider,
        isActive: true,
        lastUsedAt: new Date(),
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(device);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error registering device:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// Get user's devices
router.get('/user/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Users can only view their own devices (unless admin)
    if (userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const devices = await prisma.pushDevice.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });

    res.json(devices);
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Get device by ID
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const device = await prisma.pushDevice.findUnique({
      where: { id },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Users can only view their own devices (unless admin)
    if (device.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(device);
  } catch (error) {
    console.error('Error getting device:', error);
    res.status(500).json({ error: 'Failed to get device' });
  }
});

// Update device
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const data = updateDeviceSchema.parse(req.body);

    const device = await prisma.pushDevice.findUnique({
      where: { id },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Users can only update their own devices (unless admin)
    if (device.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.pushDevice.update({
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
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const device = await prisma.pushDevice.findUnique({
      where: { id },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Users can only delete their own devices (unless admin)
    if (device.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.pushDevice.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// Activate device
router.post('/:id/activate', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const device = await prisma.pushDevice.findUnique({
      where: { id },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Users can only activate their own devices (unless admin)
    if (device.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.pushDevice.update({
      where: { id },
      data: {
        isActive: true,
        lastUsedAt: new Date(),
        updatedBy: req.user!.userId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error activating device:', error);
    res.status(500).json({ error: 'Failed to activate device' });
  }
});

// Deactivate device
router.post('/:id/deactivate', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    const device = await prisma.pushDevice.findUnique({
      where: { id },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Users can only deactivate their own devices (unless admin)
    if (device.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.pushDevice.update({
      where: { id },
      data: {
        isActive: false,
        updatedBy: req.user!.userId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error deactivating device:', error);
    res.status(500).json({ error: 'Failed to deactivate device' });
  }
});

// Delete by token (useful for logout)
router.delete('/token/:token', requireAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const device = await prisma.pushDevice.findUnique({
      where: { deviceToken: token },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Users can only delete their own devices (unless admin)
    if (device.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.pushDevice.delete({
      where: { deviceToken: token },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

export default router;
