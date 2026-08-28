import nodemailer from 'nodemailer';
import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

export type OtpPurpose = 'ACCOUNT_VERIFICATION' | 'FRIEND_REQUEST';

export interface SendOtpEmailParams {
  toEmail: string;
  userName: string;
  otp: string;
  purpose: OtpPurpose;
  details?: {
    requesterName?: string;
    requesterShioriId?: string;
  };
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const isGmail = host.includes('gmail') || (user && (user.includes('swaplyone.in') || user.includes('gmail.com')));

  return nodemailer.createTransport({
    host: isGmail ? 'smtp.gmail.com' : host,
    port: secure ? 465 : port,
    secure: secure,
    family: 4, // Force IPv4 to prevent ENETUNREACH on cloud environments like Render
    auth: {
      user,
      pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });
}

// Startup Diagnostics (Safe, Never logs passwords)
export async function verifySmtpConnection(): Promise<void> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  console.log('=========================================');
  console.log('[SMTP DIAGNOSTICS]');
  console.log(`SMTP_HOST configured: ${Boolean(host)} (${host || 'none'})`);
  console.log(`SMTP_PORT configured: ${process.env.SMTP_PORT || '465'}`);
  console.log(`SMTP_USER configured: ${Boolean(user)} (${user ? user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'none'})`);
  console.log(`SMTP_PASS configured: ${Boolean(pass)}`);
  console.log('=========================================');

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[SMTP WARNING] SMTP credentials not fully configured. Codes will be logged to server console.');
    return;
  }

  try {
    await transporter.verify();
    console.log('[SMTP STATUS] ✓ SMTP server connection verified and ready to deliver emails.');
  } catch (err: any) {
    console.error('[SMTP STATUS] ✕ SMTP verification failed:', err.message || err);
  }
}

export async function sendOtpEmail({
  toEmail,
  userName,
  otp,
  purpose,
  details,
}: SendOtpEmailParams): Promise<SendEmailResult> {
  const cleanTo = toEmail.trim().toLowerCase();
  const rawFrom = process.env.SMTP_FROM || 'SHIORI <founder@swaplyone.in>';
  const from = rawFrom.includes('<') ? rawFrom : `"SHIORI" <${rawFrom}>`;

  // 1. Differentiate subject & template based on purpose
  let subject = '';
  let headline = '';
  let description = '';

  if (purpose === 'ACCOUNT_VERIFICATION') {
    subject = 'SHIORI account verification code';
    headline = 'SHIORI ACCOUNT VERIFICATION';
    description = `Welcome to SHIORI, ${userName || 'Developer'}. Use the verification code below to activate your account and set up your workspace:`;
  } else if (purpose === 'FRIEND_REQUEST') {
    subject = 'SHIORI connection verification code';
    headline = 'SHIORI CONNECTION VERIFICATION';
    const requester = details?.requesterName ? `${details.requesterName} (${details.requesterShioriId || 'SHIORI User'})` : 'A developer';
    description = `${requester} has accepted your SHIORI connection request. Enter this code to confirm your verified collaborator connection:`;
  } else {
    subject = 'SHIORI verification code';
    headline = 'SHIORI VERIFICATION';
    description = 'Your verification code is:';
  }

  const textContent = `${headline}

${description}

${otp}

This code expires in 5 minutes.
Do not share this code with anyone.

SHIORI — A SwaplyOne product • Plan. Build. Verify.`;

  const htmlContent = `
    <div style="font-family: 'Courier New', Courier, monospace; background-color: #F4F3EE; color: #111111; padding: 28px; border: 1px solid #B8B7B1; max-width: 480px; margin: 0 auto; line-height: 1.5;">
      <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #555555; border-bottom: 1px solid #B8B7B1; padding-bottom: 8px; margin-bottom: 16px;">
        ${headline}
      </div>
      <p style="font-size: 13px; margin: 0 0 16px 0;">
        ${description}
      </p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 0; text-align: center; background-color: #EAE9E3; border: 1px solid #111111; margin: 20px 0; font-family: monospace;">
        ${otp}
      </div>
      <p style="font-size: 11px; color: #555555; margin: 16px 0 0 0;">
        • This code expires in 5 minutes.<br />
        • Do not share this code with anyone.<br />
        • If you did not request this, you can safely ignore this email.
      </p>
      <div style="border-top: 1px solid #B8B7B1; margin-top: 24px; padding-top: 12px; font-size: 10px; color: #777777; letter-spacing: 1px;">
        SHIORI — A SwaplyOne product • Plan. Build. Verify.
      </div>
    </div>
  `;

  // Always log for observability
  console.log(`=========================================`);
  console.log(`[EMAIL DISPATCH] To: ${cleanTo}`);
  console.log(`[EMAIL DISPATCH] Purpose: ${purpose}`);
  console.log(`[EMAIL DISPATCH] Subject: ${subject}`);
  console.log(`[EMAIL DISPATCH] OTP: ${otp}`);
  console.log(`=========================================`);

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[EMAIL WARNING] SMTP transporter not available. Code logged to console.');
    // In local dev without SMTP, return success with console delivery
    return { success: true, messageId: `console-${Date.now()}` };
  }

  try {
    console.log(`[EMAIL] Sending ${purpose} email to ${cleanTo}...`);
    const info = await transporter.sendMail({
      from,
      to: cleanTo,
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`[EMAIL] Accepted by SMTP provider. messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL] FAILED to send email to ${cleanTo}:`, error.message || error);
    return { success: false, error: error.message || 'SMTP delivery failed' };
  }
}
