import nodemailer from 'nodemailer';
import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

export type OtpPurpose = 'ACCOUNT_VERIFICATION' | 'FRIEND_REQUEST' | 'PASSWORD_RESET';

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

export interface SendUsernameEmailParams {
  toEmail: string;
  userName?: string;
  username: string;
  shioriId: string;
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
  } else if (purpose === 'PASSWORD_RESET') {
    subject = 'SHIORI password reset code';
    headline = 'SHIORI PASSWORD RESET';
    description = `Hello ${userName || 'Developer'}. We received a request to reset your SHIORI account password. Enter this verification code to proceed:`;
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
          from: process.env.RESEND_FROM || 'SHIORI <verify@swaplyone.in>',
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

  // Provider 3: Direct SMTP over IPv4 SSL (465)
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

export async function sendUsernameEmail({
  toEmail,
  userName,
  username,
  shioriId,
}: SendUsernameEmailParams): Promise<SendEmailResult> {
  const cleanTo = toEmail.trim().toLowerCase();
  const rawFrom = process.env.SMTP_FROM || 'SHIORI <founder@swaplyone.in>';
  const from = rawFrom.includes('<') ? rawFrom : `"SHIORI" <${rawFrom}>`;

  const subject = 'Your SHIORI username and account details';
  const headline = 'SHIORI ACCOUNT RECOVERY';
  const description = `Hello ${userName || 'Developer'}. Here are your SHIORI account credentials as requested:`;

  const textContent = `${headline}

${description}

Username: ${username}
SHIORI ID: ${shioriId}
Email: ${cleanTo}

You can now sign in at https://swaplyone-shiori.onrender.com/login using your username or email.

SHIORI — A SwaplyOne product • Plan. Build. Verify.`;

  const htmlContent = `
    <div style="font-family: 'Courier New', Courier, monospace; background-color: #F4F3EE; color: #111111; padding: 28px; border: 1px solid #B8B7B1; max-width: 480px; margin: 0 auto; line-height: 1.5;">
      <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #555555; border-bottom: 1px solid #B8B7B1; padding-bottom: 8px; margin-bottom: 16px;">
        ${headline}
      </div>
      <p style="font-size: 13px; margin: 0 0 16px 0;">
        ${description}
      </p>
      <div style="background-color: #EAE9E3; border: 1px solid #111111; padding: 16px; margin: 20px 0; font-family: monospace;">
        <div style="font-size: 13px; margin-bottom: 8px;"><strong>Username:</strong> <span style="font-size: 16px; font-weight: bold; color: #111111;">${username}</span></div>
        <div style="font-size: 13px; margin-bottom: 8px;"><strong>SHIORI ID:</strong> <span style="font-weight: bold;">${shioriId}</span></div>
        <div style="font-size: 12px; color: #555555;"><strong>Email:</strong> ${cleanTo}</div>
      </div>
      <p style="font-size: 11px; color: #555555; margin: 16px 0 0 0;">
        • If you did not request this recovery email, please secure your account.<br />
        • Never share your credentials with anyone.
      </p>
      <div style="border-top: 1px solid #B8B7B1; margin-top: 24px; padding-top: 12px; font-size: 10px; color: #777777; letter-spacing: 1px;">
        SHIORI — A SwaplyOne product • Plan. Build. Verify.
      </div>
    </div>
  `;

  console.log(`=========================================`);
  console.log(`[EMAIL DISPATCH - USERNAME RECOVERY] To: ${cleanTo}`);
  console.log(`[EMAIL DISPATCH] Username: ${username} | ID: ${shioriId}`);
  console.log(`=========================================`);

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'SHIORI <verify@swaplyone.in>',
          to: [cleanTo],
          subject,
          text: textContent,
          html: htmlContent,
        }),
      });

      const resData = (await resendRes.json()) as any;
      if (resendRes.ok && resData?.id) {
        return { success: true, messageId: resData.id, provider: 'resend' };
      }
    } catch (resendErr: any) {
      console.warn('[EMAIL NOTICE] Resend username delivery notice:', resendErr.message);
    }
  }

  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (brevoApiKey) {
    try {
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
        return { success: true, messageId: brevoData.messageId, provider: 'resend' };
      }
    } catch (brevoErr: any) {
      console.warn('[EMAIL NOTICE] Brevo request failed:', brevoErr.message);
    }
  }

  const transporter = createTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to: cleanTo,
        subject,
        text: textContent,
        html: htmlContent,
      });
      return { success: true, messageId: info.messageId, provider: 'smtp' };
    } catch (smtpErr: any) {
      return { success: false, error: smtpErr.message || 'SMTP delivery failed' };
    }
  }

  return { success: true, messageId: `console-${Date.now()}`, provider: 'console' };
}

export interface SendGithubNeedsAttentionEmailParams {
  toEmail: string;
  userName?: string;
}

export async function sendGithubNeedsAttentionEmail({
  toEmail,
  userName = 'Developer',
}: SendGithubNeedsAttentionEmailParams): Promise<SendEmailResult> {
  const cleanTo = toEmail.trim().toLowerCase();
  const rawFrom = process.env.SMTP_FROM || 'SHIORI <founder@swaplyone.in>';
  const from = rawFrom.includes('<') ? rawFrom : `"SHIORI" <${rawFrom}>`;

  const clientUrl = process.env.CLIENT_URL || 'https://shiori-six-plum.vercel.app';
  const reconnectUrl = `${clientUrl.replace(/\/$/, '')}/github`;

  const subject = 'Your SHIORI GitHub connection needs attention';
  const textContent = `Hi ${userName},

SHIORI couldn't access your GitHub account.

Your GitHub connection needs to be reconnected to continue Git verification and commit-based task updates.

Reconnect your GitHub account:
${reconnectUrl}

Reconnecting takes less than a minute.

If you did not expect this, you can safely ignore this email.

— SHIORI`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background-color: #F4F3ED; border: 1px solid #D5D3C8; border-radius: 4px; color: #1A1A1A;">
      <div style="border-bottom: 2px solid #1A1A1A; padding-bottom: 12px; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666666; font-weight: bold;">SHIORI • GITHUB INTEGRATION</span>
      </div>
      
      <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.3px; color: #1A1A1A;">
        GitHub Connection Needs Attention
      </h2>
      
      <p style="font-size: 14px; line-height: 1.6; color: #333333; margin-bottom: 16px;">
        Hi <strong>${userName}</strong>,
      </p>
      
      <p style="font-size: 14px; line-height: 1.6; color: #333333; margin-bottom: 16px;">
        SHIORI couldn't access your GitHub account.
      </p>
      
      <p style="font-size: 14px; line-height: 1.6; color: #333333; margin-bottom: 24px;">
        Your GitHub connection needs to be reconnected to continue Git verification and commit-based task updates.
      </p>
      
      <div style="margin: 28px 0; text-align: center;">
        <a href="${reconnectUrl}" style="display: inline-block; padding: 12px 28px; background-color: #1A1A1A; color: #F4F3ED; text-decoration: none; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; border-radius: 2px; text-transform: uppercase;">
          Reconnect GitHub
        </a>
      </div>
      
      <p style="font-size: 12px; line-height: 1.5; color: #666666; margin-top: 24px;">
        Reconnecting takes less than a minute.<br/>
        If you did not expect this, you can safely ignore this email.
      </p>
      
      <div style="border-top: 1px solid #B8B7B1; margin-top: 28px; padding-top: 14px; font-size: 10px; color: #777777; letter-spacing: 1px;">
        SHIORI — A SwaplyOne product • Plan. Build. Verify.
      </div>
    </div>
  `;

  console.log(`=========================================`);
  console.log(`[EMAIL DISPATCH - GITHUB RECONNECT] To: ${cleanTo}`);
  console.log(`[EMAIL DISPATCH] Subject: ${subject}`);
  console.log(`=========================================`);

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'SHIORI <verify@swaplyone.in>',
          to: [cleanTo],
          subject,
          text: textContent,
          html: htmlContent,
        }),
      });

      const resData = (await resendRes.json()) as any;
      if (resendRes.ok && resData?.id) {
        return { success: true, messageId: resData.id, provider: 'resend' };
      }
    } catch (resendErr: any) {
      console.warn('[EMAIL NOTICE] Resend GitHub notice delivery:', resendErr.message);
    }
  }

  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (brevoApiKey) {
    try {
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
        return { success: true, messageId: brevoData.messageId, provider: 'resend' };
      }
    } catch (brevoErr: any) {
      console.warn('[EMAIL NOTICE] Brevo GitHub notice failed:', brevoErr.message);
    }
  }

  const transporter = createTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to: cleanTo,
        subject,
        text: textContent,
        html: htmlContent,
      });
      return { success: true, messageId: info.messageId, provider: 'smtp' };
    } catch (smtpErr: any) {
      return { success: false, error: smtpErr.message || 'SMTP delivery failed' };
    }
  }

  return { success: true, messageId: `console-${Date.now()}`, provider: 'console' };
}
