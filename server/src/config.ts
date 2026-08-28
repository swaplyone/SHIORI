import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const candidateEnvFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

for (const envPath of candidateEnvFiles) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'shiori-secret-developer-token-key-2026',
  clientUrl: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://shiori-six-plum.vercel.app' : 'http://localhost:5173'),
  githubClientId: process.env.GITHUB_CLIENT_ID || 'Ov23li1zsUXHPz3jSsYD',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '91383118cc197d454fe2c9f50caa42edf96c519b',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'shiori_webhook_signature_secret',
  dbPath: path.resolve(process.cwd(), 'shiori.sqlite'),
};
