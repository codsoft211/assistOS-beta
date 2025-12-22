/**
 * Notification Center - Layer 4 Platform Service
 * 
 * Unified notification management across all channels
 * 
 * Features:
 * - Multi-channel routing (in-app, email, WhatsApp, SMS)
 * - User preferences management
 * - Template rendering with Handlebars
 * - Daily/weekly digest summaries
 * - Retry logic and graceful degradation
 * - Tenant isolation and security
 * 
 * CRITICAL FIX (Phase 4.2):
 * - Dependency injection for EmailService and WhatsAppAPIService
 * - Environment isolation for all notification queries
 */

export * from './NotificationCenterService';
export * from './ChannelRouter';
export * from './NotificationPreferencesService';
export * from './DigestService';
export * from './TemplateService';

// Create singleton instances with proper dependency injection
import { NotificationCenterService } from './NotificationCenterService';
import { ChannelRouter } from './ChannelRouter';
import { emailService } from '../../platform/services/EmailService';
import { whatsappAPIService } from '../../../apps/api/services/whatsapp-api.service';

// Initialize ChannelRouter with injected dependencies
const channelRouter = new ChannelRouter(emailService, whatsappAPIService);

// Initialize NotificationCenterService with ChannelRouter
const notificationCenterService = new NotificationCenterService(channelRouter);

// Export singleton instances
export { notificationCenterService, channelRouter };
export { notificationPreferencesService } from './NotificationPreferencesService';
export { digestService } from './DigestService';
export { templateService } from './TemplateService';
