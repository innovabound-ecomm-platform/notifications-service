import { Router, Request, Response } from 'express';
import { prisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateQuerySchema,
  createTemplateVersionSchema,
  rejectVersionSchema,
  createLocalizationSchema,
  updateLocalizationSchema,
  createTenantOverrideSchema,
  updateTenantOverrideSchema,
} from '../schemas/notification.schema';

const router = Router();

// Create notification template
router.post('/', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const data = createTemplateSchema.parse(req.body);

    const template = await prisma.notificationTemplate.create({
      data: {
        ...data,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// List templates
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = templateQuerySchema.parse(req.query);
    const { page, limit, status, notificationType, channel, search } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (notificationType) where.notificationType = notificationType;
    if (channel) where.channel = channel;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.notificationTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notificationTemplate.count({ where }),
    ]);

    res.json({
      data: templates,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Get template by ID
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const template = await prisma.notificationTemplate.findUnique({
      where: { id },
      include: {
        localizations: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 5,
        },
        tenantOverrides: true,
      },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Get template by slug
router.get('/slug/:slug', requireAuth, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const template = await prisma.notificationTemplate.findUnique({
      where: { slug },
      include: {
        localizations: true,
      },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Update template
router.put('/:id', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const data = updateTemplateSchema.parse(req.body);

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...data,
        updatedBy: req.user!.userId,
      },
    });

    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template
router.delete('/:id', requireAuth, requirePermission('admin', 'notifications:delete'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    await prisma.notificationTemplate.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Activate template
router.post('/:id/activate', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        updatedBy: req.user!.userId,
      },
    });

    res.json(template);
  } catch (error) {
    console.error('Error activating template:', error);
    res.status(500).json({ error: 'Failed to activate template' });
  }
});

// Archive template
router.post('/:id/archive', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        updatedBy: req.user!.userId,
      },
    });

    res.json(template);
  } catch (error) {
    console.error('Error archiving template:', error);
    res.status(500).json({ error: 'Failed to archive template' });
  }
});

// =====================
// TEMPLATE VERSIONS
// =====================

// Create new version
router.post('/:id/versions', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const data = createTemplateVersionSchema.parse(req.body);

    // Get current max version
    const maxVersion = await prisma.templateVersion.findFirst({
      where: { templateId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const newVersion = (maxVersion?.version || 0) + 1;

    const version = await prisma.templateVersion.create({
      data: {
        templateId,
        version: newVersion,
        ...data,
        changedBy: req.user!.userId,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(version);
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// List versions
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);

    const versions = await prisma.templateVersion.findMany({
      where: { templateId },
      orderBy: { version: 'desc' },
    });

    res.json(versions);
  } catch (error) {
    console.error('Error listing versions:', error);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Get specific version
router.get('/:id/versions/:versionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId);

    const version = await prisma.templateVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    res.json(version);
  } catch (error) {
    console.error('Error getting version:', error);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// Submit version for approval
router.post('/:id/versions/:versionId/submit', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId);

    const version = await prisma.templateVersion.update({
      where: { id: versionId },
      data: {
        status: 'PENDING_APPROVAL',
        submittedAt: new Date(),
        submittedBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.json(version);
  } catch (error) {
    console.error('Error submitting version:', error);
    res.status(500).json({ error: 'Failed to submit version' });
  }
});

// Approve version
router.post('/:id/versions/:versionId/approve', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId);

    const version = await prisma.templateVersion.update({
      where: { id: versionId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.json(version);
  } catch (error) {
    console.error('Error approving version:', error);
    res.status(500).json({ error: 'Failed to approve version' });
  }
});

// Reject version
router.post('/:id/versions/:versionId/reject', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId);
    const { rejectionReason } = rejectVersionSchema.parse(req.body);

    const version = await prisma.templateVersion.update({
      where: { id: versionId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy: req.user!.userId,
        rejectionReason,
        updatedBy: req.user!.userId,
      },
    });

    res.json(version);
  } catch (error) {
    console.error('Error rejecting version:', error);
    res.status(500).json({ error: 'Failed to reject version' });
  }
});

// Activate version
router.post('/:id/versions/:versionId/activate', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const versionId = parseInt(req.params.versionId);

    // Deprecate currently active version
    await prisma.templateVersion.updateMany({
      where: { templateId, status: 'ACTIVE' },
      data: {
        status: 'DEPRECATED',
        deactivatedAt: new Date(),
      },
    });

    // Activate new version
    const version = await prisma.templateVersion.update({
      where: { id: versionId },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        updatedBy: req.user!.userId,
      },
    });

    // Update template's active version
    await prisma.notificationTemplate.update({
      where: { id: templateId },
      data: {
        activeVersionId: versionId,
        version: version.version,
        updatedBy: req.user!.userId,
      },
    });

    res.json(version);
  } catch (error) {
    console.error('Error activating version:', error);
    res.status(500).json({ error: 'Failed to activate version' });
  }
});

// =====================
// LOCALIZATIONS
// =====================

// Add localization
router.post('/:id/localizations', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const data = createLocalizationSchema.parse(req.body);

    const localization = await prisma.templateLocalization.create({
      data: {
        templateId,
        ...data,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(localization);
  } catch (error) {
    console.error('Error creating localization:', error);
    res.status(500).json({ error: 'Failed to create localization' });
  }
});

// List localizations
router.get('/:id/localizations', requireAuth, async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);

    const localizations = await prisma.templateLocalization.findMany({
      where: { templateId },
    });

    res.json(localizations);
  } catch (error) {
    console.error('Error listing localizations:', error);
    res.status(500).json({ error: 'Failed to list localizations' });
  }
});

// Update localization
router.put('/:id/localizations/:locale', requireAuth, requirePermission('admin', 'notifications:write'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const { locale } = req.params;
    const data = updateLocalizationSchema.parse(req.body);

    const localization = await prisma.templateLocalization.update({
      where: {
        templateId_locale: { templateId, locale },
      },
      data: {
        ...data,
        updatedBy: req.user!.userId,
      },
    });

    res.json(localization);
  } catch (error) {
    console.error('Error updating localization:', error);
    res.status(500).json({ error: 'Failed to update localization' });
  }
});

// Delete localization
router.delete('/:id/localizations/:locale', requireAuth, requirePermission('admin', 'notifications:delete'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const { locale } = req.params;

    await prisma.templateLocalization.delete({
      where: {
        templateId_locale: { templateId, locale },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting localization:', error);
    res.status(500).json({ error: 'Failed to delete localization' });
  }
});

// =====================
// TENANT OVERRIDES
// =====================

// Add tenant override
router.post('/:id/overrides', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const data = createTenantOverrideSchema.parse(req.body);

    const override = await prisma.templateTenantOverride.create({
      data: {
        templateId,
        ...data,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      },
    });

    res.status(201).json(override);
  } catch (error) {
    console.error('Error creating tenant override:', error);
    res.status(500).json({ error: 'Failed to create tenant override' });
  }
});

// List tenant overrides
router.get('/:id/overrides', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);

    const overrides = await prisma.templateTenantOverride.findMany({
      where: { templateId },
    });

    res.json(overrides);
  } catch (error) {
    console.error('Error listing tenant overrides:', error);
    res.status(500).json({ error: 'Failed to list tenant overrides' });
  }
});

// Update tenant override
router.put('/:id/overrides/:siteId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const { siteId } = req.params;
    const data = updateTenantOverrideSchema.parse(req.body);

    const override = await prisma.templateTenantOverride.update({
      where: {
        templateId_siteId: { templateId, siteId },
      },
      data: {
        ...data,
        updatedBy: req.user!.userId,
      },
    });

    res.json(override);
  } catch (error) {
    console.error('Error updating tenant override:', error);
    res.status(500).json({ error: 'Failed to update tenant override' });
  }
});

// Delete tenant override
router.delete('/:id/overrides/:siteId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const { siteId } = req.params;

    await prisma.templateTenantOverride.delete({
      where: {
        templateId_siteId: { templateId, siteId },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting tenant override:', error);
    res.status(500).json({ error: 'Failed to delete tenant override' });
  }
});

export default router;
