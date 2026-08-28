import nodemailer from 'nodemailer';

export interface SendOtpEmailParams {
  toEmail: string;
  userName: string;
  otp: string;
}

export async function sendOtpEmail({ toEmail, userName, otp }: SendOtpEmailParams): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || 'no-reply@shiori.app';

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

  // Always log to server console for easy developer testing and offline work
  console.log(`=========================================`);
  console.log(`[EMAIL DISPATCH] To: ${toEmail}`);
  console.log(`[EMAIL DISPATCH] Subject: ${subject}`);
  console.log(`[EMAIL DISPATCH] OTP: ${otp}`);
  console.log(`=========================================`);

  if (!host || !user) {
    // SMTP not configured - console delivery handled
    return true;
  }

  try {
    const isGmail = !host || host.includes('gmail') || (user && (user.includes('gmail.com') || user.includes('swaplyone.in')));
    const transporter = isGmail
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user,
            pass,
          },
        })
      : nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user,
            pass,
          },
        });

    await transporter.sendMail({
      from: `"SHIORI" <${from}>`,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`[SMTP] Verification email sent successfully to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('[SMTP] Failed to deliver verification email via SMTP:', error);
    // Don't fail the verification process if external SMTP has network timeout
    return false;
  }
}
