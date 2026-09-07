/**
 * Simple migration runner — reads SQL files from migrations/ and executes them.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
const logger = require('../config/logger');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    // Track applied migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM _migrations WHERE name = $1',
        [file]
      );
      if (rows.length > 0) {
        logger.info(`Migration already applied: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info(`Applying migration: ${file}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`Migration applied: ${file}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration failed', { error: err.message });
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
  logger.info('All migrations complete');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
