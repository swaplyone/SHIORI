import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';

export function getRpInfo(req: Request) {
  const hostHeader = req.headers.host || req.hostname || 'localhost';
  const hostname = hostHeader.split(':')[0]; // strip port if present

  let rpID = hostname;
  if (hostname === '127.0.0.1') {
    rpID = 'localhost';
  }

  // Derive origin from request
  let origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (!origin) {
    const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    origin = `${proto}://${hostHeader}`;
  }
  origin = origin.replace(/\/+$/, '');

  return {
    rpName: 'SHIORI',
    rpID,
    origin,
  };
}

export function detectDeviceName(userAgent?: string): string {
  if (!userAgent) return 'Platform Device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows Hello';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Apple Face ID / Touch ID';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac Touch ID';
  if (ua.includes('android')) return 'Android Biometric';
  if (ua.includes('linux')) return 'Security Key / Device Unlock';
  return 'Platform Passkey';
}

/**
 * 1. Generate WebAuthn Registration Options for an authenticated user
 */
export async function createRegistrationOptions(req: Request, user: { id: string; email: string; name: string; username: string }) {
  const { rpName, rpID } = getRpInfo(req);

  // Retrieve user's existing credentials to prevent re-registering the same authenticator
  const existingCredentials = await queryAll(
    'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?',
    [user.id]
  );

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.name || user.username || user.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform', // prefers device biometric / PIN
    },
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
  });

  // Store challenge with 5-minute single-use expiry
  const challengeId = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await runQuery(
    `INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, expires_at, consumed, created_at)
     VALUES (?, ?, ?, 'REGISTER', ?, 0, datetime('now'))`,
    [challengeId, user.id, options.challenge, expiresAt]
  );

  return options;
}

/**
 * 2. Verify Registration Response and store credential
 */
export async function verifyAndSaveRegistration(
  req: Request,
  userId: string,
  body: RegistrationResponseJSON,
  userAgent?: string
) {
  const { rpID, origin } = getRpInfo(req);

  // Fetch pending challenge for this user
  const challengeRecord = await queryOne(
    `SELECT * FROM webauthn_challenges 
     WHERE user_id = ? AND purpose = 'REGISTER' AND consumed = 0 
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (!challengeRecord) {
    throw new Error('Registration challenge not found or already consumed. Please request a new registration.');
  }

  if (new Date(challengeRecord.expires_at).getTime() < Date.now()) {
    throw new Error('Registration challenge has expired. Please try again.');
  }

  // Consume challenge immediately to prevent replay
  await runQuery('UPDATE webauthn_challenges SET consumed = 1 WHERE id = ?', [challengeRecord.id]);

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: challengeRecord.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn registration verification failed.');
  }

  const { credential } = verification.registrationInfo;
  const credentialIdStr = credential.id;
  const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');
  const transportsStr = credential.transports ? JSON.stringify(credential.transports) : null;
  const deviceName = detectDeviceName(userAgent);

  // Check if credential ID already registered
  const existing = await queryOne('SELECT id FROM webauthn_credentials WHERE credential_id = ?', [credentialIdStr]);
  if (existing) {
    throw new Error('This device credential has already been registered.');
  }

  const newId = uuidv4();
  await runQuery(
    `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, transports, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [newId, userId, credentialIdStr, publicKeyBase64, credential.counter, deviceName, transportsStr]
  );

  return {
    verified: true,
    credentialId: newId,
    deviceName,
  };
}

/**
 * 3. Generate WebAuthn Login Options
 */
export async function createLoginOptions(req: Request, email?: string) {
  const { rpID } = getRpInfo(req);

  let allowCredentials: { id: string; transports?: any[] }[] | undefined = undefined;

  // If email is provided, restrict to credentials belonging to that user
  if (email && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    const user = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [cleanEmail, cleanEmail]);
    if (user) {
      const creds = await queryAll('SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?', [user.id]);
      if (creds && creds.length > 0) {
        allowCredentials = creds.map((c) => ({
          id: c.credential_id,
          transports: c.transports ? JSON.parse(c.transports) : undefined,
        }));
      }
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials,
  });

  const challengeId = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await runQuery(
    `INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, expires_at, consumed, created_at)
     VALUES (?, NULL, ?, 'LOGIN', ?, 0, datetime('now'))`,
    [challengeId, options.challenge, expiresAt]
  );

  return options;
}

/**
 * 4. Verify WebAuthn Login Response and return authenticated user
 */
export async function verifyLoginResponse(req: Request, body: AuthenticationResponseJSON) {
  const { rpID, origin } = getRpInfo(req);

  if (!body || !body.id) {
    throw new Error('Invalid WebAuthn response: missing credential ID.');
  }

  // Find stored credential record
  const dbCred = await queryOne('SELECT * FROM webauthn_credentials WHERE credential_id = ?', [body.id]);
  if (!dbCred) {
    throw new Error('Unrecognized device credential. Please sign in with email and password first.');
  }

  // Fetch pending login challenge
  const challengeRecord = await queryOne(
    `SELECT * FROM webauthn_challenges 
     WHERE purpose = 'LOGIN' AND consumed = 0 
     ORDER BY created_at DESC LIMIT 1`
  );

  if (!challengeRecord) {
    throw new Error('Login challenge expired or not found. Please try again.');
  }

  if (new Date(challengeRecord.expires_at).getTime() < Date.now()) {
    throw new Error('Login challenge has expired. Please try again.');
  }

  // Consume challenge
  await runQuery('UPDATE webauthn_challenges SET consumed = 1 WHERE id = ?', [challengeRecord.id]);

  const publicKeyBytes = Buffer.from(dbCred.public_key, 'base64');
  const transports = dbCred.transports ? JSON.parse(dbCred.transports) : undefined;

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: challengeRecord.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: dbCred.credential_id,
      publicKey: new Uint8Array(publicKeyBytes),
      counter: dbCred.counter,
      transports,
    },
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('WebAuthn device verification failed.');
  }

  const { newCounter } = verification.authenticationInfo;

  // Update counter and last_used_at for replay defense
  await runQuery(
    `UPDATE webauthn_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?`,
    [newCounter, dbCred.id]
  );

  // Retrieve matching SHIORI user strictly bound to dbCred.user_id (Account Isolation)
  const user = await queryOne(
    `SELECT id, shiori_id, email, username, name, bio, avatar_url, theme, points, github_connected, github_username 
     FROM users WHERE id = ?`,
    [dbCred.user_id]
  );

  if (!user) {
    throw new Error('Associated SHIORI user not found.');
  }

  return {
    verified: true,
    user,
  };
}
