/**
 * Quick test script to send a test email
 * Run with: npx tsx scripts/test-email.ts
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';

async function sendTestEmail() {
  const recipient = process.env.TEST_EMAIL_OVERRIDE || 'heyabhinav741@gmail.com';
  
  console.log('=== Email Test ===');
  console.log('SMTP Host:', process.env.SMTP_HOST);
  console.log('SMTP Port:', process.env.SMTP_PORT);
  console.log('SMTP User:', process.env.SMTP_USER);
  console.log('SMTP Pass:', process.env.SMTP_PASS ? '***configured***' : 'NOT SET');
  console.log('Recipient:', recipient);
  console.log('');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: parseInt(process.env.SMTP_PORT || '465') === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    console.log('Sending test email...');
    
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      subject: '🧪 AssistOS Workflow Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4F46E5;">✅ Email Test Successful!</h1>
          <p>This is a test email from the AssistOS Invoice Workflow system.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <h2>Sample Invoice Reminder Preview:</h2>
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px;">
            <p>Dear <strong>John Doe</strong>,</p>
            <p>This is a friendly reminder that invoice <strong>INV-2024-001</strong> for <strong>$1,500.00</strong> is overdue.</p>
            <p><strong>Due Date:</strong> Dec 10, 2024<br/>
               <strong>Amount:</strong> $1,500.00<br/>
               <strong>Days Overdue:</strong> 7</p>
            <p>Please arrange payment at your earliest convenience.</p>
            <p>Best regards,<br/>Accounts Team</p>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #888; font-size: 12px;">
            Sent at: ${new Date().toISOString()}<br/>
            From: AssistOS Workflow Builder
          </p>
        </div>
      `,
      text: 'This is a test email from AssistOS Invoice Workflow system.',
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (error: any) {
    console.error('❌ Failed to send email:', error.message);
    if (error.code === 'EAUTH') {
      console.error('\nAuthentication failed. Make sure:');
      console.error('1. SMTP_USER is your Gmail address');
      console.error('2. SMTP_PASS is an App Password (not your regular password)');
      console.error('3. 2-Step Verification is enabled on your Google account');
      console.error('\nGet an App Password: Google Account → Security → 2-Step Verification → App passwords');
    }
  }
}

sendTestEmail();
