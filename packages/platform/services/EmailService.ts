/**
 * EmailService
 * Centralized email sending service for platform-wide email notifications
 * Wraps nodemailer with consistent configuration and error handling
 */

import nodemailer from 'nodemailer';
import logger from '../../../apps/api/logger';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export class EmailService {
  private transporter: any;

  constructor() {
    const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    console.log('[EmailService] SMTP config check:', {
      host: process.env.SMTP_HOST ? 'SET' : 'NOT SET',
      port: process.env.SMTP_PORT || 'default 587',
      user: process.env.SMTP_USER ? 'SET' : 'NOT SET',
      pass: smtpPass ? 'SET' : 'NOT SET',
      passVar: process.env.SMTP_PASS ? 'SMTP_PASS' : process.env.SMTP_PASSWORD ? 'SMTP_PASSWORD' : 'NONE',
    });

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: parseInt(process.env.SMTP_PORT || '587') === 465, // true for port 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: smtpPass,
      },
    });
  }

  async sendEmail(params: SendEmailParams): Promise<void> {
    try {
      logger.info({
        msg: '[EmailService] Sending email',
        to: params.to,
        subject: params.subject,
      });

      const info = await this.transporter.sendMail({
        from: params.from || process.env.SMTP_USER || 'noreply@assistos.app',
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text || params.subject,
      });

      logger.info({
        msg: '[EmailService] Email sent successfully',
        messageId: info.messageId,
        to: params.to,
      });
    } catch (error: any) {
      logger.error({
        msg: '[EmailService] Email send failed',
        error: error.message,
        to: params.to,
      });
      throw error;
    }
  }
}

export const emailService = new EmailService();
