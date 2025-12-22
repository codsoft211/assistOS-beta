import nodemailer from 'nodemailer';
import { db } from '../../../../apps/api/db';
import { quotes, quoteLines, clients } from '../../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { selectOneFromTenantTable } from '../../../../apps/api/utils/tenant-db-helper';

interface SendQuoteEmailInput {
  quoteId: string;
  tenantId: string;
  recipientEmail?: string;
  message?: string;
  cc?: string[];
}

export class QuoteEmailService {
  private transporter: nodemailer.Transporter;
  
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  
  async sendQuoteEmail(input: SendQuoteEmailInput): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      const [quote] = await db
        .select()
        .from(quotes)
        .where(and(
          eq(quotes.id, input.quoteId),
          eq(quotes.tenantId, input.tenantId)
        ));
      
      if (!quote) {
        return { success: false, error: 'Quote not found' };
      }
      
      const lines = await db
        .select()
        .from(quoteLines)
        .where(eq(quoteLines.quoteId, quote.id));
      
      let recipientEmail = input.recipientEmail;
      if (!recipientEmail && quote.clientId) {
        const [client] = await db
          .select()
          .from(clients)
          .where(and(
            eq(clients.id, quote.clientId),
            eq(clients.tenantId, input.tenantId)
          ));
        
        recipientEmail = client?.email || undefined;
      }
      
      if (!recipientEmail) {
        return { success: false, error: 'No recipient email found' };
      }
      
      // Get company info from tenant-specific schema (not public schema)
      const company = await selectOneFromTenantTable(
        input.tenantId,
        'company_info',
        sql`tenant_id = ${input.tenantId}`
      );
      
      const pdfBuffer = await this.generateQuotePDF(quote, lines, company);
      
      const emailHtml = this.getQuoteEmailTemplate(quote, company, input.message);
      
      const info = await this.transporter.sendMail({
        from: `"${company?.name || 'AssistOS'}" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        cc: input.cc,
        subject: `Orçamento ${quote.quoteNumber} - ${quote.title}`,
        html: emailHtml,
        attachments: [
          {
            filename: `Orcamento-${quote.quoteNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      });
      
      return {
        success: true,
        messageId: info.messageId
      };
      
    } catch (error: any) {
      console.error('[QuoteEmailService] Error sending email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  private async generateQuotePDF(quote: any, lines: any[], company: any): Promise<Buffer> {
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      const htmlContent = this.getQuotePDFTemplate(quote, lines, company);
      
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      
      return Buffer.from(pdfBuffer);
      
    } finally {
      await browser.close();
    }
  }
  
  private getQuotePDFTemplate(quote: any, lines: any[], company: any): string {
    const totalWithTax = parseFloat(quote.totalPrice) * 1.23;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #333;
    }
    .header {
      border-bottom: 2px solid #3B82F6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .company-info {
      text-align: right;
    }
    .quote-title {
      font-size: 24px;
      color: #3B82F6;
      margin: 20px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background: #f0f0f0;
      padding: 10px;
      text-align: left;
      border-bottom: 2px solid #ddd;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #eee;
    }
    .totals {
      margin-top: 30px;
      text-align: right;
    }
    .totals table {
      width: 300px;
      margin-left: auto;
    }
    .total-row {
      font-weight: bold;
      font-size: 14px;
      background: #f9f9f9;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="float: left;">
      <h1 style="margin: 0; color: #3B82F6;">ORÇAMENTO</h1>
      <p style="margin: 5px 0; font-size: 14px;">Nº ${quote.quoteNumber}</p>
    </div>
    <div class="company-info">
      <strong>${company?.name || 'AssistOS'}</strong><br>
      ${company?.address || ''}<br>
      ${company?.city ? company.city + ' ' + (company.postalCode || '') : ''}<br>
      NIF: ${company?.nif || ''}<br>
      Email: ${company?.email || ''}<br>
      Tel: ${company?.phone || ''}
    </div>
    <div style="clear: both;"></div>
  </div>

  <div class="quote-title">${quote.title}</div>
  
  <p><strong>Descrição:</strong></p>
  <p>${quote.description || ''}</p>

  <table>
    <thead>
      <tr>
        <th style="width: 10%;">Nº</th>
        <th style="width: 45%;">Descrição</th>
        <th style="width: 10%;">Qtd</th>
        <th style="width: 10%;">Unidade</th>
        <th style="width: 12%;">Preço Unit.</th>
        <th style="width: 13%;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map((line: any) => `
        <tr>
          <td>${line.lineNumber}</td>
          <td>${line.description}</td>
          <td>${line.quantity}</td>
          <td>${line.unit}</td>
          <td>€${parseFloat(line.unitPrice).toFixed(2)}</td>
          <td>€${parseFloat(line.totalPrice).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal:</td>
        <td style="text-align: right;">€${parseFloat(quote.totalPrice).toFixed(2)}</td>
      </tr>
      <tr>
        <td>IVA (23%):</td>
        <td style="text-align: right;">€${(parseFloat(quote.totalPrice) * 0.23).toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td>TOTAL:</td>
        <td style="text-align: right;">€${totalWithTax.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p><strong>Condições:</strong></p>
    <ul style="margin: 5px 0; padding-left: 20px;">
      <li>Orçamento válido por 30 dias</li>
      <li>Pagamento: 50% antecipado, 50% na conclusão</li>
      <li>Prazos de execução serão definidos após confirmação</li>
    </ul>
    <p style="margin-top: 20px; text-align: center;">
      Obrigado pela preferência!<br>
      ${company?.name || 'AssistOS'}
    </p>
  </div>
</body>
</html>
    `;
  }
  
  private getQuoteEmailTemplate(quote: any, company: any, customMessage?: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #3B82F6; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
    .btn { background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Novo Orçamento</h1>
    </div>
    
    <div class="content">
      <h2>Orçamento ${quote.quoteNumber}</h2>
      <p><strong>${quote.title}</strong></p>
      
      ${customMessage ? `<p>${customMessage}</p>` : ''}
      
      <p>Em anexo encontra o orçamento detalhado para o projeto solicitado.</p>
      
      <table style="width: 100%; margin: 20px 0;">
        <tr>
          <td><strong>Número:</strong></td>
          <td>${quote.quoteNumber}</td>
        </tr>
        <tr>
          <td><strong>Valor Total:</strong></td>
          <td style="font-size: 18px; color: #3B82F6;"><strong>€${quote.totalPrice}</strong></td>
        </tr>
        <tr>
          <td><strong>Validade:</strong></td>
          <td>30 dias</td>
        </tr>
      </table>
      
      <p>Para qualquer questão, não hesite em contactar-nos.</p>
    </div>
    
    <div class="footer">
      <p>${company?.name || 'AssistOS'}</p>
      <p>${company?.email || ''} | ${company?.phone || ''}</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}

export const quoteEmailService = new QuoteEmailService();
