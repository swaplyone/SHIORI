import { getDb } from './index.js';

export async function seedDatabase() {
  await getDb();
  console.log('SHIORI database initialized in clean production mode.');
}
