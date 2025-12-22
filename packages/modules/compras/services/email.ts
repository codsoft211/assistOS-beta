/**
 * Compras Module - Email Service
 * Handles sending Purchase Order emails to suppliers with real SMTP
 * 
 * SECURITY: Never logs tokens, URLs with tokens, or sensitive credentials
 * Only logs: supplier email, PO number, amount, status, message ID
 */

import nodemailer from 'nodemailer';
import { generatePOEmailTemplate } from './email-templates';
import { getBaseUrl } from '../../../../apps/api/config/environment';

export interface SendPOEmailParams {
  supplierId: string;
  supplierEmail: string;
  supplierName: string;
  poNumber: string;
  poId: string;
  totalAmount: number;
  currency: string;
  invoiceSubmissionToken: string;
  invoiceSubmissionUrl?: string;
  tenantId: string;
  customMessage?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send Purchase Order email to supplier with invoice submission link
 * Uses SMTP if configured, gracefully degrades if not
 */
export async function sendPurchaseOrderEmail(params: SendPOEmailParams): Promise<EmailResult> {
  try {
    // Check if SMTP is configured
    const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_PORT;
    
    if (!smtpConfigured) {
      console.warn('[Compras Email] SMTP not configured - email not sent');
      console.log('[Compras Email] To:', params.supplierEmail);
      console.log('[Compras Email] PO:', params.poNumber);
      console.log('[Compras Email] Amount:', params.totalAmount, params.currency);
      console.log('[Compras Email] Invoice submission link generated (token hidden for security)');
      // SECURITY: Never log the actual token or full URL
      
      return {
        success: false,
        error: 'SMTP not configured - set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM environment variables'
      };
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    // Generate submission URL
    const baseUrl = getBaseUrl();
    const submissionUrl = `${baseUrl}/supplier-invoice/${params.invoiceSubmissionToken}`;
    
    // Generate email from template
    const { subject, html, text } = generatePOEmailTemplate({
      supplierName: params.supplierName,
      poNumber: params.poNumber,
      poId: params.poId,
      totalAmount: params.totalAmount,
      currency: params.currency,
      invoiceSubmissionUrl: submissionUrl,
      customMessage: params.customMessage
    });

    // Send email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@assistos.com',
      to: params.supplierEmail,
      subject,
      text,
      html
    });

    console.log('[Compras Email] Email sent successfully');
    console.log('[Compras Email] To:', params.supplierEmail);
    console.log('[Compras Email] PO:', params.poNumber);
    console.log('[Compras Email] Amount:', params.totalAmount, params.currency);
    console.log('[Compras Email] Message ID:', info.messageId);
    console.log('[Compras Email] Invoice submission link generated (token hidden for security)');
    // SECURITY: Never log the actual token or full URL

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error: any) {
    console.error('[Compras Email] Error sending email:', error.message);
    console.log('[Compras Email] To:', params.supplierEmail);
    console.log('[Compras Email] PO:', params.poNumber);
    
    return {
      success: false,
      error: error.message
    };
  }
}
