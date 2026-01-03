import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, isAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import {
  registerDeviceSchema,
  updateDeviceSchema,
} from '../schemas/notification.schema.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

/**
 * @openapi
 * /devices:
 *   post:
 *     summary: Register push device
 *     description: Register a device token for push notifications (users can only register their own devices)
 *     tags:
 *       - Push Devices
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
 *               - deviceToken
 *               - platform
 *             properties:
 *               userId:
 *                 type: string
 *               deviceToken:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [IOS, ANDROID, WEB]
 *               deviceName:
 *                 type: string
 *               provider:
 *                 type: string
 *                 enum: [FCM, APNS, WEB_PUSH]
 *     responses:
 *       201:
 *         description: Device registered
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = registerDeviceSchema.parse(req.body);

    // Users can only register devices for themselves (unless admin)
    if (data.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /devices/user/{userId}:
 *   get:
 *     summary: Get user's devices
 *     description: Get all registered push devices for a user
 *     tags:
 *       - Push Devices
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
 *         description: List of devices
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

    // Users can only view their own devices (unless admin)
    if (userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /devices/{id}:
 *   get:
 *     summary: Get device by ID
 *     description: Get a specific push device by ID
 *     tags:
 *       - Push Devices
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
 *         description: Device details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    if (device.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(device);
  } catch (error) {
    console.error('Error getting device:', error);
    res.status(500).json({ error: 'Failed to get device' });
  }
});

/**
 * @openapi
 * /devices/{id}:
 *   put:
 *     summary: Update device
 *     description: Update device information
 *     tags:
 *       - Push Devices
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
 *               deviceName:
 *                 type: string
 *               platform:
 *                 type: string
 *               provider:
 *                 type: string
 *     responses:
 *       200:
 *         description: Device updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    if (device.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /devices/{id}:
 *   delete:
 *     summary: Delete device
 *     description: Remove a device registration
 *     tags:
 *       - Push Devices
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
 *         description: Device deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    if (device.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /devices/{id}/activate:
 *   post:
 *     summary: Activate device
 *     description: Activate a push notification device
 *     tags:
 *       - Push Devices
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
 *         description: Device activated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Device not found
 *       500:
 *         description: Failed to activate device
 */
router.post('/:id/activate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    if (device.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /devices/{id}/deactivate:
 *   post:
 *     summary: Deactivate device
 *     description: Deactivate a push notification device
 *     tags:
 *       - Push Devices
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
 *         description: Device deactivated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Device not found
 *       500:
 *         description: Failed to deactivate device
 */
router.post('/:id/deactivate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    if (device.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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

/**
 * @openapi
 * /devices/token/{token}:
 *   delete:
 *     summary: Delete device by token
 *     description: Remove a device registration by token (useful for logout)
 *     tags:
 *       - Push Devices
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Device token
 *     responses:
 *       204:
 *         description: Device deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Device not found
 *       500:
 *         description: Failed to delete device
 */
router.delete('/token/:token', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    if (device.userId !== req.user!.userId && !isAdmin(req.user!.roles)) {
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
