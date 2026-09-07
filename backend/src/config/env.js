const { z } = require('zod');
const path = require('path');

// Load .env file
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const envSchema = z.object({
  // Fabric
  FABRIC_ORG_MSP: z.string().default('Org1MSP'),
  FABRIC_PEER_ENDPOINT: z.string().default('localhost:7051'),
  FABRIC_ORDERER_ENDPOINT: z.string().default('localhost:7050'),
  FABRIC_CHANNEL_NAME: z.string().default('healthchannel'),
  FABRIC_CHAINCODE_NAME: z.string().default('accessControl'),
  FABRIC_CRYPTO_PATH: z.string().default('../fabric-network/crypto-config'),
  FABRIC_TLS_CERT_PATH: z.string().optional(),
  FABRIC_CERT_PATH: z.string().optional(),
  FABRIC_KEY_DIR: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(16).default('dev-jwt-secret-replace-in-prod'),
  JWT_EXPIRY: z.coerce.number().default(3600),
  REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-replace-in-prod'),
  REFRESH_TOKEN_EXPIRY: z.coerce.number().default(604800),

  // App
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // PostgreSQL
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('zkhealthpass'),
  POSTGRES_USER: z.string().default('zkuser'),
  POSTGRES_PASSWORD: z.string().default('zkpass'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_GENERAL: z.coerce.number().default(100),
  RATE_LIMIT_MAX_PROOF: z.coerce.number().default(20),

  // Circuits
  CIRCUIT_WASM_PATH: z.string().optional(),
  CIRCUIT_ZKEY_PATH: z.string().optional(),
  CIRCUIT_VKEY_PATH: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;
