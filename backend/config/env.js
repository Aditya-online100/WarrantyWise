const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

// Load .env file from project root or backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const resolvedNodeEnv = process.env.NODE_ENV || 'development';

function resolveJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0) {
    return process.env.JWT_SECRET.trim();
  }
  if (resolvedNodeEnv === 'production') {
    throw new Error('JWT_SECRET environment variable must be set when NODE_ENV=production.');
  }
  console.warn('[Security] JWT_SECRET not set in environment; generated ephemeral secret for local session.');
  return crypto.randomBytes(32).toString('hex');
}

const config = {
  // Server Configuration
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: resolvedNodeEnv,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',

  // JWT Security
  JWT_SECRET: resolveJwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Azure SQL Database Configuration
  // Uses Azure Managed Identity (DefaultAzureCredential) by default when DB_SERVER is set.
  AZURE_SQL: {
    server: (process.env.DB_SERVER || '').trim(),
    database: (process.env.DB_NAME || 'WarrantyWiseDB').trim(),
    user: (process.env.DB_USER || '').trim(),
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    authMode: (process.env.DB_AUTH_MODE || 'auto').trim().toLowerCase(),
    managedIdentityClientId: (
      process.env.AZURE_CLIENT_ID ||
      process.env.DB_MANAGED_IDENTITY_CLIENT_ID ||
      ''
    ).trim(),
    options: {
      encrypt: true, // Required for Azure SQL Database
      trustServerCertificate: false,
      enableArithAbort: true,
      useUTC: true
    }
  },

  // Azure Blob Storage Configuration (Private Container + DefaultAzureCredential, no storage keys)
  AZURE_STORAGE: {
    accountName: (process.env.AZURE_STORAGE_ACCOUNT_NAME || '').trim(),
    containerName: (process.env.AZURE_STORAGE_CONTAINER_NAME || 'warranty-documents').trim(),
    managedIdentityClientId: (
      process.env.AZURE_CLIENT_ID ||
      process.env.AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID ||
      ''
    ).trim()
  },

  // Local Storage Settings (Fallback)
  UPLOAD_DIR: path.resolve(__dirname, '../uploads'),
  LOCAL_DB_PATH: path.resolve(__dirname, '../data/warrantywise.db'),
  MAX_FILE_SIZE_MB: 10
};

module.exports = config;

