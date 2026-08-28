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
  provider?: 'resend' | 'smtp' | 'console';
}

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const isGmail = host.includes('gmail') || (user && (user.includes('swaplyone.in') || user.includes('gmail.com')));
  const targetPort = isGmail ? 465 : (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465);
  const isSecure = isGmail ? true : (targetPort === 465 || process.env.SMTP_SECURE === 'true');

  return nodemailer.createTransport({
    host: isGmail ? 'smtp.gmail.com' : host,
    port: targetPort,
    secure: isSecure,
    family: 4, // Strict IPv4 to avoid ENETUNREACH on cloud environments like Render
    auth: {
      user,
      pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  } as any);
}

// Startup Diagnostics (Safe, Never logs passwords or API keys)
export async function verifySmtpConnection(): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  console.log('=========================================');
  console.log('[EMAIL DIAGNOSTICS]');
  console.log(`RESEND_API_KEY configured: ${Boolean(resendKey)}`);
  console.log(`SMTP_HOST configured: ${Boolean(host)} (${host || 'none'})`);
  console.log(`SMTP_USER configured: ${Boolean(user)} (${user ? user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'none'})`);
  console.log(`SMTP_PASS configured: ${Boolean(pass)}`);
  console.log('=========================================');

  const transporter = createTransporter();
  if (transporter) {
    try {
      await transporter.verify();
      console.log('[SMTP STATUS] ✓ Direct SMTP connection verified over IPv4 SSL (465).');
    } catch (err: any) {
      console.warn('[SMTP STATUS] ✕ Direct SMTP verification notice:', err.message || err);
    }
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

  // Provider 1: Resend HTTPS API (Port 443 - zero firewall blocks on cloud)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      console.log(`[EMAIL] Attempting delivery via Resend API to ${cleanTo}...`);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'SHIORI <onboarding@resend.dev>',
          to: [cleanTo],
          subject,
          text: textContent,
          html: htmlContent,
        }),
      });

      const resData = (await resendRes.json()) as any;
      if (resendRes.ok && resData?.id) {
        console.log(`[EMAIL] Accepted by Resend API. Email ID: ${resData.id}`);
        return { success: true, messageId: resData.id, provider: 'resend' };
      } else {
        console.warn(`[EMAIL NOTICE] Resend returned ${resendRes.status} (${resData?.message || 'sandbox restriction'}). Checking secondary providers...`);
      }
    } catch (resendErr: any) {
      console.warn('[EMAIL NOTICE] Resend request failed, checking secondary providers:', resendErr.message);
    }
  }

  // Provider 2: Brevo HTTPS API (Port 443 - sends to any recipient without domain restriction)
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (brevoApiKey) {
    try {
      console.log(`[EMAIL] Attempting delivery via Brevo HTTPS API to ${cleanTo}...`);
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'SHIORI', email: process.env.BREVO_FROM_EMAIL || 'founder@swaplyone.in' },
          to: [{ email: cleanTo, name: userName || 'Developer' }],
          subject,
          htmlContent,
          textContent,
        }),
      });

      const brevoData = (await brevoRes.json()) as any;
      if (brevoRes.ok && (brevoData?.messageId || brevoData?.messageIds)) {
        console.log(`[EMAIL] Accepted by Brevo API. messageId: ${brevoData.messageId || brevoData.messageIds[0]}`);
        return { success: true, messageId: brevoData.messageId, provider: 'resend' };
      } else {
        console.warn(`[EMAIL NOTICE] Brevo returned ${brevoRes.status}:`, brevoData);
      }
    } catch (brevoErr: any) {
      console.warn('[EMAIL NOTICE] Brevo request failed:', brevoErr.message);
    }
  }

  // Provider 2: Direct SMTP over IPv4 SSL (465)
  const transporter = createTransporter();
  if (transporter) {
    try {
      console.log(`[EMAIL] Sending ${purpose} email to ${cleanTo} via SMTP...`);
      const info = await transporter.sendMail({
        from,
        to: cleanTo,
        subject,
        text: textContent,
        html: htmlContent,
      });

      console.log(`[EMAIL] Accepted by SMTP provider. messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId, provider: 'smtp' };
    } catch (smtpErr: any) {
      console.error(`[EMAIL ERROR] SMTP delivery failed:`, smtpErr.message || smtpErr);
      return { success: false, error: smtpErr.message || 'SMTP delivery failed' };
    }
  }

  // Local development console delivery
  console.log('[EMAIL NOTICE] No external email provider active. Code logged to console.');
  return { success: true, messageId: `console-${Date.now()}`, provider: 'console' };
}
