import { Router, Response } from 'express';
import { getNotificationsPrisma } from '@innovabound-ecomm-platform/notifications-db';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
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
} from '../schemas/notification.schema.js';
import {
  getSiteId,
  templateWhere,
} from '../utils/tenant.utils.js';

const router: Router = Router();
const prisma = getNotificationsPrisma();

/**
 * @openapi
 * /templates:
 *   post:
 *     summary: Create notification template
 *     description: Create a new notification template
 *     tags:
 *       - Templates
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
 *               - name
 *               - slug
 *               - notificationType
 *               - channel
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               notificationType:
 *                 type: string
 *               channel:
 *                 type: string
 *               template:
 *                 type: string
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to create template
 */
router.post('/', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
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

/**
 * @openapi
 * /templates:
 *   get:
 *     summary: List templates
 *     description: Get a paginated list of notification templates
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
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
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: notificationType
 *         schema:
 *           type: string
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of templates
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to list templates
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

/**
 * @openapi
 * /templates/{id}:
 *   get:
 *     summary: Get template by ID
 *     description: Get detailed information about a notification template
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to get template
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

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

/**
 * @openapi
 * /templates/slug/{slug}:
 *   get:
 *     summary: Get template by slug
 *     description: Get a notification template by its slug identifier
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Template slug
 *     responses:
 *       200:
 *         description: Template details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to get template
 */
router.get('/slug/:slug', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

/**
 * @openapi
 * /templates/{id}:
 *   put:
 *     summary: Update template
 *     description: Update a notification template
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to update template
 */
router.put('/:id', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
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

/**
 * @openapi
 * /templates/{id}:
 *   delete:
 *     summary: Delete template
 *     description: Delete a notification template
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       204:
 *         description: Template deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to delete template
 */
router.delete('/:id', requireAuth, requirePermission('notifications:delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

    await prisma.notificationTemplate.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * @openapi
 * /templates/{id}/activate:
 *   post:
 *     summary: Activate template
 *     description: Set template status to active
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template activated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to activate template
 */
router.post('/:id/activate', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

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

/**
 * @openapi
 * /templates/{id}/archive:
 *   post:
 *     summary: Archive template
 *     description: Set template status to archived
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template archived successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to archive template
 */
router.post('/:id/archive', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id!);

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

/**
 * @openapi
 * /templates/{id}/versions:
 *   post:
 *     summary: Create new version
 *     description: Create a new version of a template
 *     tags:
 *       - Templates
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
 *     responses:
 *       201:
 *         description: Version created successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to create version
 */
router.post('/:id/versions', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
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

/**
 * @openapi
 * /templates/{id}/versions:
 *   get:
 *     summary: List versions
 *     description: Get all versions of a template
 *     tags:
 *       - Templates
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
 *         description: List of versions
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to list versions
 */
router.get('/:id/versions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);

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

/**
 * @openapi
 * /templates/{id}/versions/{versionId}:
 *   get:
 *     summary: Get specific version
 *     description: Get details of a specific template version
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Version details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Version not found
 *       500:
 *         description: Failed to get version
 */
router.get('/:id/versions/:versionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId!);

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

/**
 * @openapi
 * /templates/{id}/versions/{versionId}/submit:
 *   post:
 *     summary: Submit version for approval
 *     description: Submit a template version for review and approval
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Version submitted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Version not found
 *       500:
 *         description: Failed to submit version
 */
router.post('/:id/versions/:versionId/submit', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId!);

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

/**
 * @openapi
 * /templates/{id}/versions/{versionId}/approve:
 *   post:
 *     summary: Approve version
 *     description: Approve a template version (requires admin permission)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Version approved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Version not found
 *       500:
 *         description: Failed to approve version
 */
router.post('/:id/versions/:versionId/approve', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId!);

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

/**
 * @openapi
 * /templates/{id}/versions/{versionId}/reject:
 *   post:
 *     summary: Reject version
 *     description: Reject a template version with reason (requires admin permission)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejectionReason
 *             properties:
 *               rejectionReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Version rejected successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Version not found
 *       500:
 *         description: Failed to reject version
 */
router.post('/:id/versions/:versionId/reject', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versionId = parseInt(req.params.versionId!);
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

/**
 * @openapi
 * /templates/{id}/versions/{versionId}/activate:
 *   post:
 *     summary: Activate version
 *     description: Make a template version active (deprecates currently active version)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Version activated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Version not found
 *       500:
 *         description: Failed to activate version
 */
router.post('/:id/versions/:versionId/activate', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
    const versionId = parseInt(req.params.versionId!);

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

/**
 * @openapi
 * /templates/{id}/localizations:
 *   post:
 *     summary: Add localization
 *     description: Add a localized version of a template for a specific language
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locale
 *             properties:
 *               locale:
 *                 type: string
 *               localizedSubject:
 *                 type: string
 *               localizedBodyHtml:
 *                 type: string
 *               localizedBodyText:
 *                 type: string
 *     responses:
 *       201:
 *         description: Localization created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to create localization
 */
router.post('/:id/localizations', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
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

/**
 * @openapi
 * /templates/{id}/localizations:
 *   get:
 *     summary: List localizations
 *     description: Get all localized versions of a template
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: List of localizations
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to list localizations
 */
router.get('/:id/localizations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);

    const localizations = await prisma.templateLocalization.findMany({
      where: { templateId },
    });

    res.json(localizations);
  } catch (error) {
    console.error('Error listing localizations:', error);
    res.status(500).json({ error: 'Failed to list localizations' });
  }
});

/**
 * @openapi
 * /templates/{id}/localizations/{locale}:
 *   put:
 *     summary: Update localization
 *     description: Update a specific localized version of a template
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *       - in: path
 *         name: locale
 *         required: true
 *         schema:
 *           type: string
 *         description: Locale code (e.g., en, es, fr)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Localization updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Localization not found
 *       500:
 *         description: Failed to update localization
 */
router.put('/:id/localizations/:locale', requireAuth, requirePermission('notifications:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
    const locale = req.params.locale!;
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

/**
 * @openapi
 * /templates/{id}/localizations/{locale}:
 *   delete:
 *     summary: Delete localization
 *     description: Remove a localized version of a template
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *       - in: path
 *         name: locale
 *         required: true
 *         schema:
 *           type: string
 *         description: Locale code (e.g., en, es, fr)
 *     responses:
 *       204:
 *         description: Localization deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Localization not found
 *       500:
 *         description: Failed to delete localization
 */
router.delete('/:id/localizations/:locale', requireAuth, requirePermission('notifications:delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
    const locale = req.params.locale!;

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

/**
 * @openapi
 * /templates/{id}/overrides:
 *   post:
 *     summary: Add tenant override
 *     description: Create a tenant-specific template override (requires admin permission)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - siteId
 *             properties:
 *               siteId:
 *                 type: string
 *               overrideSubject:
 *                 type: string
 *               overrideBodyHtml:
 *                 type: string
 *               overrideBodyText:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tenant override created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       500:
 *         description: Failed to create tenant override
 */
router.post('/:id/overrides', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
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

/**
 * @openapi
 * /templates/{id}/overrides:
 *   get:
 *     summary: List tenant overrides
 *     description: Get all tenant-specific overrides for a template (requires admin permission)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: List of tenant overrides
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       500:
 *         description: Failed to list tenant overrides
 */
router.get('/:id/overrides', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);

    const overrides = await prisma.templateTenantOverride.findMany({
      where: { templateId },
    });

    res.json(overrides);
  } catch (error) {
    console.error('Error listing tenant overrides:', error);
    res.status(500).json({ error: 'Failed to list tenant overrides' });
  }
});

/**
 * @openapi
 * /templates/{id}/overrides/{siteId}:
 *   put:
 *     summary: Update tenant override
 *     description: Update a specific tenant override (requires admin permission)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Site/tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Tenant override updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Tenant override not found
 *       500:
 *         description: Failed to update tenant override
 */
router.put('/:id/overrides/:siteId', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
    const siteId = req.params.siteId!;
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

/**
 * @openapi
 * /templates/{id}/overrides/{siteId}:
 *   delete:
 *     summary: Delete tenant override
 *     description: Remove a tenant-specific override (requires admin permission)
 *     tags:
 *       - Templates
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Site/tenant ID
 *     responses:
 *       204:
 *         description: Tenant override deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Tenant override not found
 *       500:
 *         description: Failed to delete tenant override
 */
router.delete('/:id/overrides/:siteId', requireAuth, requirePermission('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id!);
    const siteId = req.params.siteId!;

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
