/**
 * Compras Module - Email Templates
 * HTML and text templates for Purchase Order emails
 * 
 * These templates will be used when real email implementation is added
 */

export interface POEmailTemplateParams {
  supplierName: string;
  poNumber: string;
  poId: string;
  totalAmount: number;
  currency: string;
  invoiceSubmissionUrl: string;
  customMessage?: string;
  companyName?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Generate Purchase Order email template with invoice submission link
 */
export function generatePOEmailTemplate(params: POEmailTemplateParams): EmailTemplate {
  const {
    supplierName,
    poNumber,
    totalAmount,
    currency,
    invoiceSubmissionUrl,
    customMessage,
    companyName = 'Procurement Team',
  } = params;

  const subject = `Purchase Order ${poNumber} - Action Required`;

  // Plain text version
  const text = `
Dear ${supplierName},

${customMessage ? customMessage + '\n\n' : ''}We have issued Purchase Order ${poNumber} with a total value of ${totalAmount} ${currency}.

Please review the purchase order details and submit your invoice using the following secure link:
${invoiceSubmissionUrl}

IMPORTANT: This link will expire in 48 hours.

If you have any questions or concerns about this purchase order, please contact us immediately.

Thank you for your business.

Best regards,
${companyName}
  `.trim();

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px; background-color: #3B82F6; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Purchase Order</h1>
              <p style="margin: 10px 0 0 0; color: #E0F2FE; font-size: 18px;">${poNumber}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #1F2937; font-size: 16px;">Dear <strong>${supplierName}</strong>,</p>
              
              ${customMessage ? `<p style="margin: 0 0 20px 0; color: #1F2937; font-size: 14px;">${customMessage}</p>` : ''}
              
              <p style="margin: 0 0 20px 0; color: #1F2937; font-size: 14px;">
                We have issued Purchase Order <strong>${poNumber}</strong> with a total value of:
              </p>
              
              <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 15px; margin: 0 0 20px 0;">
                <p style="margin: 0; color: #1E40AF; font-size: 24px; font-weight: bold;">
                  ${totalAmount.toFixed(2)} ${currency}
                </p>
              </div>
              
              <p style="margin: 0 0 20px 0; color: #1F2937; font-size: 14px;">
                Please review the purchase order and submit your invoice using the button below:
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${invoiceSubmissionUrl}" 
                       style="display: inline-block; background-color: #3B82F6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      Submit Invoice
                    </a>
                  </td>
                </tr>
              </table>
              
              <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #92400E; font-size: 13px;">
                  <strong>⚠️ Important:</strong> This link will expire in 48 hours.
                </p>
              </div>
              
              <p style="margin: 20px 0 0 0; color: #6B7280; font-size: 13px;">
                If you have any questions or concerns about this purchase order, please contact us immediately.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #F9FAFB; border-radius: 0 0 8px 8px; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 5px 0; color: #1F2937; font-size: 14px;">Thank you for your business.</p>
              <p style="margin: 0; color: #6B7280; font-size: 13px;">Best regards,<br><strong>${companyName}</strong></p>
            </td>
          </tr>
        </table>
        
        <!-- Email Footer -->
        <table width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, html, text };
}

/**
 * Generate reminder email for invoice submission
 */
export function generateInvoiceReminderTemplate(params: POEmailTemplateParams): EmailTemplate {
  const {
    supplierName,
    poNumber,
    totalAmount,
    currency,
    invoiceSubmissionUrl,
  } = params;

  const subject = `Reminder: Invoice Submission Required for PO ${poNumber}`;

  const text = `
Dear ${supplierName},

This is a friendly reminder that we are awaiting your invoice for Purchase Order ${poNumber} (${totalAmount} ${currency}).

Please submit your invoice using the following link:
${invoiceSubmissionUrl}

If you have already submitted the invoice, please disregard this message.

Best regards,
Procurement Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px;">
    <h2 style="color: #F59E0B; margin-top: 0;">⏰ Reminder: Invoice Submission</h2>
    <p>Dear <strong>${supplierName}</strong>,</p>
    <p>This is a friendly reminder that we are awaiting your invoice for Purchase Order <strong>${poNumber}</strong> (${totalAmount} ${currency}).</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${invoiceSubmissionUrl}" 
         style="display: inline-block; background-color: #F59E0B; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
        Submit Invoice Now
      </a>
    </p>
    <p style="color: #6B7280; font-size: 13px;">If you have already submitted the invoice, please disregard this message.</p>
    <p style="margin-top: 30px;">Best regards,<br><strong>Procurement Team</strong></p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html, text };
}
