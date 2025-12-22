import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import nodemailer from 'nodemailer';

export class SendEmailAction implements ActionExecutor {
  readonly name = 'send_email';
  readonly description = 'Send email via SMTP';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.to && config.subject && config.body);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      
      const info = await transporter.sendMail({
        from: config.from || process.env.SMTP_USER,
        to: config.to,
        subject: config.subject,
        text: config.body,
        html: config.html || config.body,
      });
      
      return {
        success: true,
        output: {
          messageId: info.messageId,
          to: config.to,
          subject: config.subject,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to send email: ${error.message}`,
      };
    }
  }
}
