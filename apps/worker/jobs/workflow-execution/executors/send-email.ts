/**
 * Send Email Node Executor
 * 
 * Sends email notifications for invoices with template substitution.
 * Supports batch mode (one email per invoice) or single mode.
 * 
 * Template variables:
 * - {{customer_name}}, {{customer_email}}, {{customer_company}}
 * - {{invoice_number}}, {{amount}}, {{currency}}, {{due_date}}
 * - {{days_overdue}}, {{description}}, {{status}}
 * 
 * Input: Array of invoices from previous node
 * Output: Email sending results
 */

import { pool } from '../../../db.js';
import type { AssistBuildNode } from '../../../../../shared/schema.js';
import logger from '../../../../api/logger.js';
import { emailService } from '../../../../../packages/platform/services/EmailService.js';

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  variables: Record<string, any>;
  triggerData?: any;
}

interface SendEmailConfig {
  mode: 'batch' | 'single';
  toField: string;
  ccField?: string;
  subject: string;
  bodyTemplate: string;
  fromName?: string;
  replyTo?: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string;
  days_overdue?: number;
  description?: string;
}

interface EmailResult {
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  status: 'sent' | 'failed' | 'simulated';
  error?: string;
  sentAt?: string;
}

export class SendEmailExecutor {
  async execute(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; output?: any; error?: string }> {
    const { executionId, environment } = context;
    const config = node.config as SendEmailConfig;

    logger.info(
      {
        executionId,
        nodeId: node.id,
        nodeType: 'send_email',
        mode: config.mode,
        subject: config.subject,
        toField: config.toField,
        bodyTemplate: config.bodyTemplate?.substring(0, 100),
        configKeys: Object.keys(config)
      },
      '[SendEmailExecutor] Starting email send operation'
    );

    try {
      // Check for SMTP configuration early to provide feedback even in sandbox
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
      const hasSMTP = !!(smtpUser && smtpPass);

      if (!hasSMTP) {
        logger.error({ executionId, nodeId: node.id }, '[SendEmailExecutor] SMTP credentials not configured');
        return {
          success: false,
          error: 'SMTP credentials (SMTP_USER, SMTP_PASS) are not configured in environment variables.',
        };
      }

      // Get invoices from context (set by previous fetch_invoice node)
      const invoices: Invoice[] = context.variables['invoices'] || [];

      logger.info(
        {
          executionId,
          nodeId: node.id,
          invoiceCount: invoices.length,
          firstInvoice: invoices[0] ? {
            invoice_number: invoices[0].invoice_number,
            customer_email: invoices[0].customer_email,
            amount: invoices[0].amount
          } : null
        },
        '[SendEmailExecutor] Loaded invoices from context'
      );

      if (invoices.length === 0) {
        logger.info(
          { executionId, nodeId: node.id },
          '[SendEmailExecutor] No invoices to process, skipping email send'
        );

        return {
          success: true, // It's a valid state (nothing to do), but we mark it as successful
          output: {
            sent: 0,
            failed: 0,
            skipped: true,
            reason: 'No invoices were found by the previous node. Check your filters.',
            results: [],
          },
        };
      }

      const results: EmailResult[] = [];
      let sentCount = 0;
      let failedCount = 0;

      // IMPORTANT: Limit to 5 emails only (personal SMTP server quota)
      const MAX_EMAILS = 5;
      const maxEmailsToSend = Math.min(invoices.length, MAX_EMAILS);
      const invoicesToProcess = invoices.slice(0, maxEmailsToSend);

      logger.info(
        {
          executionId,
          totalInvoices: invoices.length,
          maxEmails: MAX_EMAILS,
          processingCount: invoicesToProcess.length,
          limited: invoices.length > MAX_EMAILS,
          skippedCount: Math.max(0, invoices.length - MAX_EMAILS)
        },
        `[SendEmailExecutor] 📧 Processing ${invoicesToProcess.length} invoices (limited to ${MAX_EMAILS} for SMTP quota)`
      );

      // Process each invoice with explicit count tracking
      for (let i = 0; i < invoicesToProcess.length; i++) {
        const invoice = invoicesToProcess[i];
        const emailNumber = i + 1; // 1-indexed for logging

        logger.info(
          {
            executionId,
            emailNumber,
            maxEmails: MAX_EMAILS,
            invoiceNumber: invoice.invoice_number
          },
          `[SendEmailExecutor] 📩 Sending email ${emailNumber}/${MAX_EMAILS}`
        );

        // Add delay between emails to avoid rate limiting (except for first one)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }

        try {

          // Substitute template variables
          const recipientEmail = this.resolveTemplateField(config.toField, invoice);
          const subject = this.substituteTemplate(config.subject, invoice);
          const body = this.substituteTemplate(config.bodyTemplate, invoice);

          logger.debug(
            {
              executionId,
              recipientEmail,
              subject: subject.substring(0, 50),
            },
            '[SendEmailExecutor] Template substitution complete'
          );

          // In sandbox mode, simulate email sending
          // In production, integrate with actual email service
          const emailResult = await this.sendEmail(
            {
              to: recipientEmail,
              cc: config.ccField ? this.resolveTemplateField(config.ccField, invoice) : undefined,
              subject,
              body,
              fromName: config.fromName || 'AssistOS Workflow',
              replyTo: config.replyTo,
            },
            invoice,
            executionId,
            environment
          );

          results.push(emailResult);

          if (emailResult.status === 'sent' || emailResult.status === 'simulated') {
            sentCount++;
          } else {
            failedCount++;
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : '';

          logger.error(
            {
              executionId,
              invoiceNumber: invoice.invoice_number,
              error: errorMessage,
              stack: errorStack
            },
            '[SendEmailExecutor] Failed to process invoice email'
          );

          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            recipientEmail: invoice.customer_email,
            status: 'failed',
            error: errorMessage,
          });

          failedCount++;
        }
      }

      // Store results in context
      const output = {
        sent: sentCount,
        failed: failedCount,
        processed: invoicesToProcess.length,
        totalInvoices: invoices.length,
        results,
        completedAt: new Date().toISOString(),
        environment,
      };

      context.variables['emailResults'] = output;

      logger.info(
        {
          executionId,
          nodeId: node.id,
          sent: sentCount,
          failed: failedCount,
          processed: invoicesToProcess.length,
          totalInvoices: invoices.length
        },
        '[SendEmailExecutor] ✅ Email send operation completed'
      );

      // Consider it success if at least one email was sent
      return {
        success: sentCount > 0 || failedCount === 0,
        output,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        { error: errorMessage, executionId, nodeId: node.id },
        '[SendEmailExecutor] ❌ Email send operation failed'
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Resolve a template field like {{customer_email}} to actual value
   */
  private resolveTemplateField(template: string | undefined, invoice: Invoice): string {
    // Safety check for undefined template
    if (!template || typeof template !== 'string') {
      logger.warn(
        { template, templateType: typeof template },
        '[SendEmailExecutor] Template is undefined or invalid'
      );
      return '';
    }

    // If it's a template variable, extract and resolve
    const match = template.match(/\{\{(\w+)\}\}/);
    if (match) {
      const field = match[1];
      return (invoice as any)[field] || template;
    }
    return template;
  }

  /**
   * Substitute all template variables in a string
   */
  private substituteTemplate(template: string | undefined, invoice: Invoice): string {
    // Safety check for undefined template
    if (!template || typeof template !== 'string') {
      logger.warn(
        { template, templateType: typeof template },
        '[SendEmailExecutor] Template is undefined or invalid in substituteTemplate'
      );
      return '';
    }

    let result = template;

    // Safely get values with defaults
    const safeAmount = typeof invoice.amount === 'number' ? invoice.amount : parseFloat(String(invoice.amount)) || 0;

    // Common invoice fields
    const replacements: Record<string, string | number> = {
      customer_name: invoice.customer_name || 'Customer',
      customer_email: invoice.customer_email || '',
      customer_company: invoice.customer_company || '',
      invoice_number: invoice.invoice_number || '',
      amount: safeAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      currency: invoice.currency || 'USD',
      status: invoice.status || '',
      due_date: invoice.due_date || '',
      days_overdue: invoice.days_overdue || 0,
      description: invoice.description || '',
    };

    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }

    return result;
  }

  /**
   * Send email - in sandbox mode, simulate; in production, use email service
   */
  private async sendEmail(
    email: {
      to: string;
      cc?: string;
      subject: string;
      body: string;
      fromName: string;
      replyTo?: string;
    },
    invoice: Invoice,
    executionId: string,
    environment: 'sandbox' | 'production'
  ): Promise<EmailResult> {
    const now = new Date().toISOString();

    // Log the email to the database regardless of environment
    try {
      await pool.query(`
        INSERT INTO invoice_workflow_schema.email_logs 
        (workflow_execution_id, recipient_email, subject, body, status, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        executionId,
        email.to,
        email.subject,
        email.body,
        environment === 'sandbox' ? 'simulated' : 'sent',
        now
      ]);
    } catch (dbError) {
      // Log error but don't fail - table might not exist in all environments
      logger.warn(
        { error: (dbError as Error).message },
        '[SendEmailExecutor] Failed to log email to database'
      );
    }

    // For demo: Override recipient to test email address if configured
    const testEmailOverride = process.env.TEST_EMAIL_OVERRIDE;
    const actualRecipient = testEmailOverride || email.to;

    if (environment === 'sandbox' && !testEmailOverride) {
      // Simulate sending in sandbox mode (unless test override is set)
      logger.info(
        {
          to: email.to,
          subject: email.subject,
          invoiceNumber: invoice.invoice_number,
          environment: 'sandbox'
        },
        '[SendEmailExecutor] 📧 Simulated email send (sandbox mode)'
      );

      // Log full email content in debug for verification
      logger.debug(
        {
          to: email.to,
          cc: email.cc,
          from: email.fromName,
          subject: email.subject,
          body: email.body.substring(0, 500) + (email.body.length > 500 ? '...' : ''),
        },
        '[SendEmailExecutor] Email content (sandbox)'
      );

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        recipientEmail: email.to,
        status: 'simulated',
        sentAt: now,
      };
    }

    // Production mode OR sandbox with test override - send actual email
    try {
      // Convert plain text body to HTML
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${email.subject}</h2>
          <div style="white-space: pre-wrap; line-height: 1.6;">${email.body}</div>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
          <p style="color: #888; font-size: 12px;">
            This is an automated email from AssistOS Workflow.
            Invoice: ${invoice.invoice_number}
          </p>
        </div>
      `;

      await emailService.sendEmail({
        to: actualRecipient,
        subject: email.subject,
        html: htmlBody,
        text: email.body,
      });

      logger.info(
        {
          to: actualRecipient,
          originalTo: email.to,
          subject: email.subject,
          invoiceNumber: invoice.invoice_number,
          environment
        },
        '[SendEmailExecutor] 📧 Email sent successfully!'
      );

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        recipientEmail: actualRecipient,
        status: 'sent',
        sentAt: now,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, to: actualRecipient },
        '[SendEmailExecutor] ❌ Failed to send email'
      );

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        recipientEmail: actualRecipient,
        status: 'failed',
        error: errorMessage,
      };
    }
  }
}
