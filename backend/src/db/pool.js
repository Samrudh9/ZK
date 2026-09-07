const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../config/logger');

const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/**
 * Run a query against the pool.
 * @param {string} text - SQL query
 * @param {any[]} params - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug('DB query', { text: text.substring(0, 80), duration, rows: result.rowCount });
  return result;
}

/**
 * Test the database connection.
 */
async function testConnection() {
  try {
    await pool.query('SELECT NOW()');
    logger.info('PostgreSQL connected');
    return true;
  } catch (err) {
    logger.warn('PostgreSQL not available', { error: err.message });
    return false;
  }
}

module.exports = { pool, query, testConnection };
