import { z } from 'zod';

// Enums matching Prisma schema
export const NotificationChannelEnum = z.enum([
  'EMAIL',
  'SMS',
  'PUSH',
  'IN_APP',
  'WEBHOOK',
]);

export const NotificationStatusEnum = z.enum([
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'BOUNCED',
  'SPAM_REPORTED',
]);

export const NotificationTypeEnum = z.enum([
  'ORDER_CONFIRMATION',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'ORDER_REFUNDED',
  'SHIPPING_UPDATE',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
  'WELCOME',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'EMAIL_VERIFICATION',
  'TWO_FACTOR_CODE',
  'LOGIN_ALERT',
  'SUSPICIOUS_ACTIVITY',
  'ACCOUNT_LOCKED',
  'REVIEW_REQUEST',
  'REVIEW_APPROVED',
  'REVIEW_RESPONSE',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_RECEIVED',
  'REFUND_PROCESSED',
  'PROMOTIONAL',
  'ABANDONED_CART',
  'BACK_IN_STOCK',
  'PRICE_DROP',
  'WISHLIST_SALE',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_CANCELLED',
  'PAYMENT_FAILED',
  'TRIAL_ENDING',
  'CUSTOM',
]);

export const TemplateStatusEnum = z.enum([
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
]);

export const TemplateVersionStatusEnum = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'ACTIVE',
  'DEPRECATED',
]);

export const PriorityEnum = z.enum([
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
]);

// Template schemas
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  notificationType: NotificationTypeEnum,
  channel: NotificationChannelEnum,
  subject: z.string().optional(),
  preheader: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  bodyJson: z.record(z.any()).optional(),
  smsBody: z.string().optional(),
  variables: z.record(z.any()).optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  locale: z.string().default('en-US'),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const templateQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: TemplateStatusEnum.optional(),
  notificationType: NotificationTypeEnum.optional(),
  channel: NotificationChannelEnum.optional(),
  search: z.string().optional(),
});

// Template version schemas
export const createTemplateVersionSchema = z.object({
  changeNotes: z.string().optional(),
  subject: z.string().optional(),
  preheader: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  bodyJson: z.record(z.any()).optional(),
  smsBody: z.string().optional(),
  variables: z.record(z.any()).optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
});

export const rejectVersionSchema = z.object({
  rejectionReason: z.string().min(1),
});

// Template localization schemas
export const createLocalizationSchema = z.object({
  locale: z.string().min(2).max(10),
  subject: z.string().optional(),
  preheader: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  bodyJson: z.record(z.any()).optional(),
  smsBody: z.string().optional(),
});

export const updateLocalizationSchema = createLocalizationSchema.omit({ locale: true });

// Notification schemas
export const createNotificationSchema = z.object({
  siteId: z.string().optional(),
  userId: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  deviceToken: z.string().optional(),
  notificationType: NotificationTypeEnum,
  channel: NotificationChannelEnum,
  templateId: z.number().optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  bodyJson: z.record(z.any()).optional(),
  contextData: z.record(z.any()).optional(),
  correlationId: z.string().optional(),
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  returnId: z.string().optional(),
  subscriptionId: z.string().optional(),
  customerId: z.string().optional(),
  productId: z.string().optional(),
  cartId: z.string().optional(),
  priority: PriorityEnum.default('NORMAL'),
  scheduledFor: z.coerce.date().optional(),
});

export const notificationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: NotificationStatusEnum.optional(),
  notificationType: NotificationTypeEnum.optional(),
  channel: NotificationChannelEnum.optional(),
  userId: z.string().optional(),
  orderId: z.string().optional(),
  correlationId: z.string().optional(),
});

// User preference schemas
export const updatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    notificationType: NotificationTypeEnum,
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
  })),
});

export const updateSinglePreferenceSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
});

// In-app notification schemas
export const createInAppNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  icon: z.string().optional(),
  imageUrl: z.string().url().optional(),
  actionUrl: z.string().optional(),
  actionText: z.string().optional(),
  notificationType: NotificationTypeEnum.optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

export const inAppQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  read: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  notificationType: NotificationTypeEnum.optional(),
});

// Push device schemas
export const registerDeviceSchema = z.object({
  userId: z.string().min(1),
  deviceToken: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().optional(),
  provider: z.enum(['fcm', 'apns', 'web-push']),
});

export const updateDeviceSchema = z.object({
  deviceName: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

// Webhook schemas
export const createWebhookSchema = z.object({
  userId: z.string().optional(),
  url: z.string().url(),
  description: z.string().optional(),
  subscribedEvents: z.array(NotificationTypeEnum).min(1),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().optional(),
  subscribedEvents: z.array(NotificationTypeEnum).optional(),
  isActive: z.boolean().optional(),
});

export const webhookQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  userId: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export const webhookDeliveryQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: NotificationStatusEnum.optional(),
});

// Email event schemas
export const createEmailEventSchema = z.object({
  notificationId: z.number().optional(),
  messageId: z.string().min(1),
  email: z.string().email(),
  eventType: z.enum(['delivered', 'opened', 'clicked', 'bounced', 'spam_report', 'unsubscribed']),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  clickUrl: z.string().url().optional(),
  bounceType: z.enum(['hard', 'soft']).optional(),
  occurredAt: z.coerce.date(),
});

export const emailEventQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  email: z.string().email().optional(),
  eventType: z.string().optional(),
});

// Unsubscribe schemas
export const createUnsubscribeSchema = z.object({
  email: z.string().email(),
  userId: z.string().optional(),
  unsubscribeAll: z.boolean().default(false),
  categories: z.array(NotificationTypeEnum).default([]),
  reason: z.string().optional(),
});

export const updateUnsubscribeSchema = z.object({
  unsubscribeAll: z.boolean().optional(),
  categories: z.array(NotificationTypeEnum).optional(),
  reason: z.string().optional(),
});

// Template tenant override schemas
export const createTenantOverrideSchema = z.object({
  siteId: z.string().min(1),
  subject: z.string().optional(),
  preheader: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  bodyJson: z.record(z.any()).optional(),
  smsBody: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  isActive: z.boolean().default(true),
});

export const updateTenantOverrideSchema = createTenantOverrideSchema.omit({ siteId: true }).partial();
