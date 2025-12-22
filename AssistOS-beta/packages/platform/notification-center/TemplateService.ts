/**
 * TemplateService
 * Manages Handlebars templates for multi-channel notifications
 * 
 * Supports:
 * - Email (HTML with branding, links, action buttons)
 * - WhatsApp (Short text-only with link)
 * - SMS (Ultra-short text with essential info)
 * - In-App (Title + message + link)
 */

import Handlebars from 'handlebars';
import logger from '../../../apps/api/logger';

export type Channel = 'in_app' | 'email' | 'whatsapp' | 'sms';

export interface TemplateData {
  tenantName?: string;
  userName?: string;
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  metadata?: any;
  [key: string]: any;
}

export class TemplateService {
  private templates: Record<string, Record<Channel, string>> = {
    'task_assigned': {
      email: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{title}}</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      <p>{{message}}</p>
      {{#if link}}
        <a href="{{link}}" class="button">{{linkText}}</a>
      {{/if}}
      <div class="footer">
        <p>© {{tenantName}} - All rights reserved</p>
      </div>
    </div>
  </div>
</body>
</html>`,
      whatsapp: `*{{title}}*\n\n{{message}}\n\n{{#if link}}🔗 {{link}}{{/if}}`,
      sms: `{{title}}: {{message}}{{#if link}} - {{link}}{{/if}}`,
      in_app: `{{title}}\n{{message}}`,
    },
    
    'approval_needed': {
      email: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .urgent { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; padding: 12px 24px; background: #F59E0B; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ {{title}}</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      <div class="urgent">
        <strong>Action Required:</strong> {{message}}
      </div>
      {{#if link}}
        <a href="{{link}}" class="button">{{linkText}}</a>
      {{/if}}
      <div class="footer">
        <p>© {{tenantName}} - All rights reserved</p>
      </div>
    </div>
  </div>
</body>
</html>`,
      whatsapp: `⚠️ *{{title}}*\n\n{{message}}\n\n{{#if link}}Take action: {{link}}{{/if}}`,
      sms: `URGENT: {{message}}{{#if link}} {{link}}{{/if}}`,
      in_app: `{{title}}\n{{message}}`,
    },
    
    'status_changed': {
      email: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .status-box { background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{title}}</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      <div class="status-box">
        <strong>Update:</strong> {{message}}
      </div>
      {{#if link}}
        <a href="{{link}}" class="button">{{linkText}}</a>
      {{/if}}
      <div class="footer">
        <p>© {{tenantName}} - All rights reserved</p>
      </div>
    </div>
  </div>
</body>
</html>`,
      whatsapp: `✅ *{{title}}*\n\n{{message}}\n\n{{#if link}}View details: {{link}}{{/if}}`,
      sms: `Status: {{message}}{{#if link}} {{link}}{{/if}}`,
      in_app: `{{title}}\n{{message}}`,
    },
    
    'daily_digest': {
      email: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6366F1; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .notification-group { margin: 20px 0; }
    .notification-item { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 3px solid #6366F1; }
    .button { display: inline-block; padding: 12px 24px; background: #6366F1; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Daily Summary</h1>
      <p>Your notifications for {{date}}</p>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      <p>Here's your daily summary of {{totalCount}} notifications:</p>
      
      {{#each groups}}
        <div class="notification-group">
          <h3>{{this.category}} ({{this.count}})</h3>
          {{#each this.notifications}}
            <div class="notification-item">
              <strong>{{this.title}}</strong>
              <p>{{this.message}}</p>
              {{#if this.link}}
                <a href="{{this.link}}">{{this.linkText}}</a>
              {{/if}}
            </div>
          {{/each}}
        </div>
      {{/each}}
      
      <a href="{{dashboardLink}}" class="button">View All Notifications</a>
      
      <div class="footer">
        <p>© {{tenantName}} - All rights reserved</p>
        <p><a href="{{unsubscribeLink}}">Unsubscribe from daily digests</a></p>
      </div>
    </div>
  </div>
</body>
</html>`,
      whatsapp: '',
      sms: '',
      in_app: '',
    },
    
    'weekly_digest': {
      email: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #8B5CF6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat-box { text-align: center; padding: 15px; background: white; border-radius: 6px; flex: 1; margin: 0 5px; }
    .stat-number { font-size: 32px; font-weight: bold; color: #8B5CF6; }
    .notification-group { margin: 20px 0; }
    .notification-item { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 3px solid #8B5CF6; }
    .button { display: inline-block; padding: 12px 24px; background: #8B5CF6; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Weekly Summary</h1>
      <p>Your notifications from {{weekStart}} to {{weekEnd}}</p>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      <p>Here's your weekly summary:</p>
      
      <div class="stats">
        <div class="stat-box">
          <div class="stat-number">{{totalCount}}</div>
          <div>Total</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">{{urgentCount}}</div>
          <div>Urgent</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">{{unreadCount}}</div>
          <div>Unread</div>
        </div>
      </div>
      
      {{#each groups}}
        <div class="notification-group">
          <h3>{{this.category}} ({{this.count}})</h3>
          {{#each this.notifications}}
            <div class="notification-item">
              <strong>{{this.title}}</strong>
              <p>{{this.message}}</p>
              {{#if this.link}}
                <a href="{{this.link}}">{{this.linkText}}</a>
              {{/if}}
            </div>
          {{/each}}
        </div>
      {{/each}}
      
      <a href="{{dashboardLink}}" class="button">View All Notifications</a>
      
      <div class="footer">
        <p>© {{tenantName}} - All rights reserved</p>
        <p><a href="{{unsubscribeLink}}">Unsubscribe from weekly digests</a></p>
      </div>
    </div>
  </div>
</body>
</html>`,
      whatsapp: '',
      sms: '',
      in_app: '',
    },
  };

  /**
   * Render a template with provided data
   */
  async render(templateName: string, channel: Channel, data: TemplateData): Promise<string> {
    try {
      const templateString = this.getTemplateString(templateName, channel);
      
      if (!templateString) {
        logger.warn(`[TemplateService] Template not found: ${templateName} for channel ${channel}`);
        return this.getFallbackTemplate(channel, data);
      }

      const template = Handlebars.compile(templateString);
      return template(data);
    } catch (error: any) {
      logger.error(`[TemplateService] Error rendering template:`, error);
      return this.getFallbackTemplate(channel, data);
    }
  }

  /**
   * Get template string for a notification type and channel
   */
  private getTemplateString(notificationType: string, channel: Channel): string | null {
    const typeTemplates = this.templates[notificationType];
    if (!typeTemplates) {
      return null;
    }
    
    return typeTemplates[channel] || null;
  }

  /**
   * Get a fallback template when the specific template is not found
   */
  private getFallbackTemplate(channel: Channel, data: TemplateData): string {
    switch (channel) {
      case 'email':
        return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.title}</h1>
    </div>
    <div class="content">
      <p>${data.message}</p>
      ${data.link ? `<a href="${data.link}">${data.linkText || 'View More'}</a>` : ''}
    </div>
  </div>
</body>
</html>`;
      
      case 'whatsapp':
        return `*${data.title}*\n\n${data.message}${data.link ? `\n\n${data.link}` : ''}`;
      
      case 'sms':
        return `${data.title}: ${data.message}${data.link ? ` - ${data.link}` : ''}`;
      
      case 'in_app':
      default:
        return `${data.title}\n${data.message}`;
    }
  }

  /**
   * Register a custom template
   */
  registerTemplate(notificationType: string, channel: Channel, templateString: string): void {
    if (!this.templates[notificationType]) {
      this.templates[notificationType] = {
        in_app: '',
        email: '',
        whatsapp: '',
        sms: '',
      };
    }
    
    this.templates[notificationType][channel] = templateString;
    logger.info(`[TemplateService] Registered custom template: ${notificationType} for ${channel}`);
  }

  /**
   * List all available templates
   */
  listTemplates(): string[] {
    return Object.keys(this.templates);
  }
}

export const templateService = new TemplateService();
