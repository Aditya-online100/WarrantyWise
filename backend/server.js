const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config/env');
const db = require('./services/db');
const blobStorage = require('./services/blobStorage');
const errorHandler = require('./middleware/errorHandler');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const warrantyRoutes = require('./routes/warrantyRoutes');
const repairRoutes = require('./routes/repairRoutes');
const documentRoutes = require('./routes/documentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Trust reverse proxy headers when running behind Azure App Service load balancer
app.set('trust proxy', 1);

// Security and Utility Middlewares
const configuredOrigins = String(config.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      config.NODE_ENV !== 'production' ||
      process.env.CORS_STRICT !== 'true' ||
      !origin ||
      configuredOrigins.includes(origin) ||
      configuredOrigins.includes('*')
    ) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS policy.`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Basic Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Simple Request Logging in Development
if (config.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    name: 'WarrantyWise REST API',
    version: '1.0.0',
    environment: config.NODE_ENV,
    database_mode: db.getDbMode(),
    database_auth_mode: db.getDbAuthMode(),
    storage_mode: blobStorage.getStorageMode(),
    storage_auth_mode: blobStorage.getStorageAuthMode(),
    storage_container: blobStorage.getContainerName(),
    timestamp: new Date().toISOString()
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/warranties', warrantyRoutes);
app.use('/api/repairs', repairRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// Serve Frontend Static Bundle if built
const frontendDist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  console.log(`[Static] Serving compiled React frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 Handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.baseUrl} does not exist.`
  });
});

// Centralized Application Error Handler
app.use(errorHandler);

// Server Startup Function
async function startServer() {
  try {
    await db.initDb();
    blobStorage.initStorage();
    const server = app.listen(config.PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 WarrantyWise Backend Server running on port ${config.PORT}`);
      console.log(`📡 Health Check: http://localhost:${config.PORT}/api/health`);
      console.log(`🗄️ Database Engine: ${db.getDbMode()} (${db.getDbAuthMode()})`);
      console.log(`📦 Storage Engine: ${blobStorage.getStorageMode()} (${blobStorage.getStorageAuthMode()})`);
      console.log(`🔒 Security: JWT Auth, Bcrypt, RBAC, Parameterized SQL`);
      console.log(`=======================================================`);
    });

    const shutdown = async () => {
      console.log('[Server] Shutting down gracefully...');
      server.close(async () => {
        await db.closeDb();
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return server;
  } catch (err) {
    console.error('Fatal error during server startup:', err);
    process.exit(1);
  }
}

// Only auto-listen if not run as a test runner module
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
