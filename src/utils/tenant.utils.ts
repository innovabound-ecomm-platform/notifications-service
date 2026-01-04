/**
 * Tenant utilities for notifications-service
 * Provides helpers for tenant-scoped database operations
 */

import type { Request } from "express";
import type { Prisma } from "@innovabound-ecomm-platform/notifications-db";

export function getSiteId(req: Request): string | undefined {
  return (req as { siteId?: string }).siteId;
}

export function requireSiteId(req: Request): string {
  const siteId = getSiteId(req);
  if (!siteId) {
    throw new TenantRequiredError();
  }
  return siteId;
}

interface TenantQueryOptions {
  strict?: boolean;
}

export function templateWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.NotificationTemplateWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.NotificationTemplateWhereInput {
  // Templates are shared across tenants, so default strict to false
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.NotificationTemplateWhereInput = { ...additionalWhere };
  // NotificationTemplate doesn't have siteId - templates are global
  return where;
}

export function notificationWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.NotificationWhereInput,
  options: TenantQueryOptions = { strict: true }
): Prisma.NotificationWhereInput {
  const { strict = true } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.NotificationWhereInput = { ...additionalWhere };
  if (siteId) {
    where.siteId = siteId;
  }
  return where;
}

export function inAppNotificationWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.InAppNotificationWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.InAppNotificationWhereInput {
  // InAppNotification is user-scoped (userId), not tenant-scoped
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.InAppNotificationWhereInput = { ...additionalWhere };
  // InAppNotification doesn't have siteId - it's user-scoped
  return where;
}

export function webhookEndpointWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.WebhookEndpointWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.WebhookEndpointWhereInput {
  // WebhookEndpoint is user-scoped (userId), not tenant-scoped
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.WebhookEndpointWhereInput = { ...additionalWhere };
  // WebhookEndpoint doesn't have siteId - it's user-scoped
  return where;
}

export function pushDeviceWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.PushDeviceWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.PushDeviceWhereInput {
  // PushDevice is user-scoped (userId), not tenant-scoped
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.PushDeviceWhereInput = { ...additionalWhere };
  // PushDevice doesn't have siteId - it's user-scoped
  return where;
}

export function notificationPreferenceWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.NotificationPreferenceWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.NotificationPreferenceWhereInput {
  // NotificationPreference is user-scoped (userId), not tenant-scoped
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.NotificationPreferenceWhereInput = { ...additionalWhere };
  // NotificationPreference doesn't have siteId - it's user-scoped
  return where;
}

export function emailEventWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.EmailEventWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.EmailEventWhereInput {
  // EmailEvent doesn't have siteId
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.EmailEventWhereInput = { ...additionalWhere };
  return where;
}

export function unsubscribeWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.UnsubscribeWhereInput,
  options: TenantQueryOptions = { strict: false }
): Prisma.UnsubscribeWhereInput {
  // Unsubscribe doesn't have siteId - it's email/user-scoped
  const { strict = false } = options;
  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }
  const where: Prisma.UnsubscribeWhereInput = { ...additionalWhere };
  return where;
}

export function withSiteId<T extends Record<string, unknown>>(
  data: T,
  siteId: string | undefined
): T & { siteId: string } {
  if (!siteId) {
    throw new TenantRequiredError("siteId is required for create operations");
  }
  return { ...data, siteId };
}

export function validateTenantOwnership(
  recordSiteId: string | null | undefined,
  requestSiteId: string | undefined
): void {
  if (!requestSiteId) {
    throw new TenantRequiredError("Tenant context required");
  }
  if (!recordSiteId || recordSiteId !== requestSiteId) {
    throw new TenantRequiredError("Record does not belong to current tenant");
  }
}

export class TenantRequiredError extends Error {
  public readonly code = "TENANT_REQUIRED";
  public readonly statusCode = 403;
  constructor(message = "Tenant context is required for this operation") {
    super(message);
    this.name = "TenantRequiredError";
  }
}
