import nodemailer from 'nodemailer';

export interface SendOtpEmailParams {
  toEmail: string;
  userName: string;
  otp: string;
}

export async function sendOtpEmail({ toEmail, userName, otp }: SendOtpEmailParams): Promise<boolean> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER || 'founder@swaplyone.in';
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || 'SHIORI <founder@swaplyone.in>';

  const subject = 'SHIORI connection verification code';
  const textContent = `Your SHIORI verification code is:

${otp}

This code expires in 5 minutes.

Do not share this code with anyone.`;

  const htmlContent = `
    <div style="font-family: 'Courier New', monospace; background-color: #F4F3EE; color: #111111; padding: 24px; border: 1px solid #B8B7B1; max-width: 480px; margin: 0 auto;">
      <h2 style="font-size: 16px; text-transform: uppercase; margin-top: 0; border-bottom: 1px solid #B8B7B1; padding-bottom: 8px;">SHIORI VERIFICATION</h2>
      <p style="font-size: 13px;">Hello ${userName || 'Developer'},</p>
      <p style="font-size: 13px;">Your SHIORI connection verification code is:</p>
      <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 12px 0; text-align: center; background-color: #EAE9E3; border: 1px solid #B8B7B1; margin: 16px 0;">
        ${otp}
      </div>
      <p style="font-size: 11px; color: #777777;">This code expires in 5 minutes.<br />Do not share this code with anyone.</p>
      <div style="border-top: 1px solid #B8B7B1; margin-top: 20px; padding-top: 8px; font-size: 10px; color: #777777;">
        SHIORI — A SwaplyOne product • Plan. Build. Verify.
      </div>
    </div>
  `;

  // Always log to server console for testing
  console.log(`=========================================`);
  console.log(`[EMAIL DISPATCH] To: ${toEmail}`);
  console.log(`[EMAIL DISPATCH] Subject: ${subject}`);
  console.log(`[EMAIL DISPATCH] OTP: ${otp}`);
  console.log(`=========================================`);

  if (!user || !pass) {
    console.log('[SMTP NOTICE] SMTP_USER or SMTP_PASSWORD not set. Code logged to console.');
    return true;
  }

  try {
    const isGmail = host.includes('gmail') || user.includes('swaplyone.in') || user.includes('gmail.com');
    const transporter = nodemailer.createTransport({
      host: isGmail ? 'smtp.gmail.com' : host,
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });

    const senderHeader = from.includes('<') ? from : `"SHIORI" <${from}>`;

    const info = await transporter.sendMail({
      from: senderHeader,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`[SMTP] Verification email delivered to ${toEmail}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[SMTP ERROR] Failed to deliver email via SMTP:', error);
    return false;
  }
}
