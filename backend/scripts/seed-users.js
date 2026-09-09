'use strict';

/**
 * Seed demo users for local development / demos.
 * Uses the same auth.service path as the registration API, so passwords are
 * bcrypt-hashed exactly like a real /auth/register call.
 *
 * Run:  node scripts/seed-users.js   (requires backend/.env with working Postgres)
 */

const authService = require('../src/services/auth.service');

const users = [
  { userId: 'alice', password: 'alicepw', role: 'PATIENT' },
  { userId: 'drbob', password: 'bobpw', role: 'PROVIDER' },
];

(async () => {
  for (const { userId, password, role } of users) {
    try {
      const orgId = role === 'PROVIDER' ? 'Org2MSP' : 'Org1MSP';
      const result = await authService.registerUser({ userId, password, role, orgId });
      console.log(`seeded ${userId} (${role}) -> wallet ${result.walletId}`);
    } catch (err) {
      if (err.code === '23505') {
        console.log(`already exists: ${userId}`);
      } else {
        console.error(`failed to seed ${userId}:`, err.message);
      }
    }
  }
  process.exit(0);
})();