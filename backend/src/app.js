const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const logger = require('./config/logger');
const { generalLimiter } = require('./api/middleware/rateLimiter');
const errorHandler = require('./api/middleware/errorHandler');

// Import routes
const authRoutes = require('./api/routes/auth.routes');
const consentRoutes = require('./api/routes/consent.routes');
const proofRoutes = require('./api/routes/proof.routes');
const auditRoutes = require('./api/routes/audit.routes');

const app = express();

// Security and middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(generalLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes (v1)
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/consent', consentRoutes);
apiRouter.use('/proof', proofRoutes);
apiRouter.use('/audit', auditRoutes);

app.use('/v1', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint not found', statusCode: 404 },
  });
});

// Global error handler
app.use(errorHandler);

// Start server if not imported
if (require.main === module) {
  const PORT = env.PORT || 3001;
  app.listen(PORT, async () => {
    logger.info(`ZKHealthPass Backend running on port ${PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    
    // Attempt DB and Fabric connections on startup
    const { testConnection } = require('./db/pool');
    await testConnection();
    
    try {
      const fabric = require('./services/fabric.service');
      // Uncomment to connect to Fabric on startup once network is running
      // await fabric.connectGateway();
    } catch (err) {
      logger.warn('Could not connect to Fabric gateway on startup (expected if network is down)');
    }
  });
}

module.exports = app;
