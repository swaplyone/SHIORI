import crypto from 'crypto';

export function generateSecureOTP(): string {
  // 6-digit cryptographically secure numeric OTP
  return crypto.randomInt(100000, 999999).toString();
}

export function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

export function verifyOTPHash(inputOtp: string, storedHash: string): boolean {
  const inputHash = hashOTP(inputOtp);
  try {
    return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

export function generateShioriId(): string {
  // Generate format SHI-XXXXXX (e.g. SHI-7K4M92)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = 'SHI-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return result;
}
