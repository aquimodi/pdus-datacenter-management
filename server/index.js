import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import rackRoutes from './routes/racks.js';
import sensorRoutes from './routes/sensors.js';
import problemsRoutes from './routes/problems.js';
import thresholdsRoutes from './routes/thresholds.js';
import debugRoutes from './routes/debug.js';
import systemRoutes from './routes/system.js';
import { setupLogger } from './utils/logger.js';
import debugMiddleware from './middleware/debugMiddleware.js';
import { loggingMiddleware, errorLoggingMiddleware } from './middleware/loggingMiddleware.js';
import { httpLoggingMiddleware } from './middleware/httpLoggingMiddleware.js';
import { isApiReachable, getCircuitBreakerStatus } from './utils/api.js';
import { pingDatabase, initializePool, dbEnabled } from './config/db.js';
import { checkDatabaseEnv, applyDatabaseSafeguards } from './utils/dbInit.js';
import monitoringService from './services/monitoringService.js';

// Setup file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: join(__dirname, '.env') });

// Initialize logger
const logger = setupLogger();

// Make sure logs directory exists
const logDir = join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    console.warn('Warning: Could not create logs directory:', error.message);
  }
}

// Create Express app
const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Check if database environment variables are properly set
const { dbEnabled: dbConfigEnabled } = checkDatabaseEnv();

// Log startup information
logger.info('Server starting up', {
  env: process.env.NODE_ENV,
  port: PORT,
  version: process.env.npm_package_version || 'unknown',
  nodeVersion: process.version,
  databaseEnabled: dbConfigEnabled
});

// CORS configuration - Allow all origins & preflight requests
const corsOptions = {
  origin: '*',  // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Debug', 'X-Request-ID', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['X-Debug-Id', 'X-Debug-Time', 'X-Debug-Path', 'X-Request-ID', 'Access-Control-Allow-Origin'],
  credentials: false,
  maxAge: 86400  // Cache preflight response for 24 hours
};

// Apply CORS middleware with enhanced options
app.use(cors(corsOptions));

// Add explicit OPTIONS handler for preflight requests
app.options('*', cors(corsOptions));

// Add request ID and detailed HTTP logging middleware - MUST be first in chain
app.use(httpLoggingMiddleware);

// Add comprehensive logging middleware
app.use(loggingMiddleware);

// Add debug middleware
app.use(debugMiddleware);

// Set up Morgan for HTTP logging - output to both console and file
// Create log file directory if it doesn't exist
try {
  const accessLogStream = fs.createWriteStream(join(logDir, 'access.log'), { flags: 'a' });

  // Custom morgan format with request ID
  morgan.token('request-id', (req) => req.requestId);
  app.use(morgan(':request-id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms', {
    stream: accessLogStream
  }));
} catch (error) {
  logger.error('Failed to create log stream for Morgan:', {
    error: error.message,
    stack: error.stack
  });
  // Continue without file logging, but still log to console
  morgan.token('request-id', (req) => req.requestId);
  app.use(morgan(':request-id :method :url :status :response-time ms'));
}

// Extended morgan format with request and response bodies when in development mode
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan((tokens, req, res) => {
    const log = [
      tokens.requestId(req, res),
      tokens.method(req, res),
      tokens.url(req, res),
      tokens.status(req, res),
      tokens.responseTime(req, res), 'ms'
    ].join(' ');
    
    // Add request and response bodies in development mode
    const requestBody = req.body && Object.keys(req.body).length ? 
      `\nRequest Body: ${JSON.stringify(req.body, null, 2)}` : '';
    
    // We can't easily get response body here, it's handled in httpLoggingMiddleware
      
    return `${log}${requestBody}`;
  }));
}

// Express built-in middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Error handling middleware
app.use(errorLoggingMiddleware);

// Initialize database connection pool with better error handling
if (dbConfigEnabled) {
  logger.info('Initializing database connection pool');
  initializePool()
    .then(async (pool) => {
      if (pool) {
        logger.info('Database connection pool initialized successfully');
        
        // Apply SQL Server compatibility safeguards
        try {
          const dbModule = await import('./config/db.js');
          await applyDatabaseSafeguards(dbModule.default || dbModule);
        } catch (err) {
          logger.warn('Failed to apply database safeguards:', {
            error: err.message
          });
        }
      } else {
        logger.warn('Database connection pool initialization returned null. Some features may be unavailable.');
      }
    })
    .catch(err => {
      logger.error('Failed to initialize database connection pool:', {
        error: err.message,
        stack: err.stack
      });
      logger.warn('Continuing with database features disabled');
    });
} else {
  logger.warn('Database features are disabled due to missing environment variables');
}

// CORS middleware to ensure headers are set for all routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  res.header("Access-Control-Expose-Headers", "X-Debug-Id, X-Debug-Time, X-Debug-Path, X-Request-ID");
  next();
});

// Routes
app.use('/api/racks', rackRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/problems', problemsRoutes);
app.use('/api/thresholds', thresholdsRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/system', systemRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// Monitoring service endpoints
app.get('/api/monitoring/status', (req, res) => {
  const status = monitoringService.getMonitoringStatus();
  res.status(200).json({
    status: 'Success',
    data: status
  });
});

app.post('/api/monitoring/start', (req, res) => {
  const interval = req.body.interval || 300000; // Default to 5 minutes
  monitoringService.startMonitoring(interval);
  res.status(200).json({
    status: 'Success',
    message: `Monitoring service started with interval of ${interval}ms`
  });
});

app.post('/api/monitoring/stop', (req, res) => {
  monitoringService.stopMonitoring();
  res.status(200).json({
    status: 'Success',
    message: 'Monitoring service stopped'
  });
});

app.post('/api/monitoring/run-now', async (req, res) => {
  try {
    await monitoringService.runMonitoringCycle();
    res.status(200).json({
      status: 'Success',
      message: 'Monitoring cycle triggered'
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      message: `Error triggering monitoring cycle: ${error.message}`
    });
  }
});

// Debug info endpoint
app.get('/api/debug/info', async (req, res) => {
  // Check API reachability
  const api1Reachable = await isApiReachable(process.env.API1_URL);
  const api2Reachable = await isApiReachable(process.env.API2_URL);
  
  // Check database connectivity
  const dbConnected = await pingDatabase();
  
  // Get circuit breaker status
  const circuitBreakers = getCircuitBreakerStatus();
  
  // Get monitoring status
  const monitoringStatus = monitoringService.getMonitoringStatus();
  
  const info = {
    status: 'OK',
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    serverPort: process.env.SERVER_PORT,
    bindAddress: process.env.BIND_ADDRESS || '0.0.0.0',
    apis: {
      api1Url: process.env.API1_URL,
      api1Reachable,
      api2Url: process.env.API2_URL,
      api2Reachable
    },
    database: {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      connected: dbConnected,
      enabled: dbEnabled,
      // Don't include sensitive credentials
      user: process.env.SQL_USER ? '********' : undefined,
      password: process.env.SQL_PASSWORD ? '********' : undefined
    },
    circuitBreakers,
    monitoring: monitoringStatus,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    processId: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  };
  
  logger.debug('Debug info requested', {
    requestId: req.requestId,
    apiStatus: {
      api1Reachable,
      api2Reachable
    },
    dbConnected,
    dbEnabled
  });
  
  res.status(200).json(info);
});

// API connection test endpoint
app.get('/api/test-connection', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    logger.warn('Test connection request missing URL parameter', {
      requestId: req.requestId
    });
    
    return res.status(400).json({
      status: 'Error',
      message: 'URL parameter is required'
    });
  }
  
  logger.info(`Testing connection to ${url}`, {
    requestId: req.requestId,
    url
  });
  
  try {
    const startTime = Date.now();
    const isReachable = await isApiReachable(url);
    const duration = Date.now() - startTime;
    
    logger.info(`Connection test to ${url} completed: ${isReachable ? 'Successful' : 'Failed'}`, {
      requestId: req.requestId,
      url,
      isReachable,
      duration: `${duration}ms`
    });
    
    res.status(200).json({
      status: 'Success',
      isReachable,
      responseTime: duration,
      message: isReachable 
        ? 'API endpoint is reachable' 
        : 'API endpoint is not reachable',
      timestamp: new Date()
    });
  } catch (error) {
    logger.error(`Error testing connection to ${url}:`, {
      requestId: req.requestId,
      url,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error testing connection: ${error.message}`
    });
  }
});

// Add configuration for serving frontend or not
const SERVE_FRONTEND = process.env.SERVE_FRONTEND === 'true';

// Conditionally serve static files in production
if (process.env.NODE_ENV === 'production' && SERVE_FRONTEND) {
  logger.info('Server running in production mode, serving static files from dist');
  app.use(express.static(join(__dirname, '../dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
  });
}

// Start the server - use BIND_ADDRESS explicitly to bind to service IP
const server = app.listen(PORT, process.env.BIND_ADDRESS || '0.0.0.0', () => {
  const bindAddress = process.env.BIND_ADDRESS || 'all interfaces (0.0.0.0)';
  logger.info(`Server running on port ${PORT} on interface ${bindAddress}`);
  console.log(`Server running on port ${PORT} on interface ${bindAddress}`);
  
  // Check API endpoints on startup
  checkApiEndpoints();
  // Check database connection on startup
  checkDatabaseConnection();
  
  // Start the monitoring service with default interval after short delay
  setTimeout(() => {
    monitoringService.startMonitoring();
    logger.info('Automatic data monitoring service started');
  }, 10000); // 10 seconds delay to allow server to fully initialize
});

// Handle server errors
server.on('error', (error) => {
  logger.error('Server error:', {
    error: error.message,
    code: error.code,
    stack: error.stack
  });
  
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else if (error.code === 'EADDRNOTAVAIL') {
    logger.error(`Cannot bind to address ${process.env.BIND_ADDRESS}: Address not available`);
    logger.info(`Try using a valid interface IP address or 0.0.0.0 to bind to all interfaces`);
    process.exit(1);
  }
});

// Function to check API endpoints on startup
async function checkApiEndpoints() {
  logger.info('Checking API endpoints...');
  
  // Check API1 (Racks API)
  try {
    const startTime = Date.now();
    const api1Reachable = await isApiReachable(process.env.API1_URL);
    const duration = Date.now() - startTime;
    
    logger.info(`API1 (${process.env.API1_URL || 'undefined'}) reachable: ${api1Reachable}`, {
      duration: `${duration}ms`
    });
    
    if (!api1Reachable) {
      logger.warn('API1 is not reachable. Will use mock data as fallback when needed.');
    }
  } catch (error) {
    logger.error(`Error checking API1:`, {
      error: error.message,
      stack: error.stack
    });
  }
  
  // Check API2 (Sensors API)
  try {
    const startTime = Date.now();
    const api2Reachable = await isApiReachable(process.env.API2_URL);
    const duration = Date.now() - startTime;
    
    logger.info(`API2 (${process.env.API2_URL || 'undefined'}) reachable: ${api2Reachable}`, {
      duration: `${duration}ms`
    });
    
    if (!api2Reachable) {
      logger.warn('API2 is not reachable. Will use mock data as fallback when needed.');
    }
  } catch (error) {
    logger.error(`Error checking API2:`, {
      error: error.message,
      stack: error.stack
    });
  }
}

// Function to check database connection on startup
async function checkDatabaseConnection() {
  if (!dbEnabled) {
    logger.warn('Database is disabled. Skipping database connection check.');
    return;
  }
  
  logger.info('Checking database connection...');
  
  try {
    const startTime = Date.now();
    const dbConnected = await pingDatabase();
    const duration = Date.now() - startTime;
    
    logger.info(`Database connection: ${dbConnected ? 'Successful' : 'Failed'}`, {
      server: process.env.SQL_SERVER || 'undefined',
      database: process.env.SQL_DATABASE || 'undefined',
      duration: `${duration}ms`
    });
    
    if (!dbConnected) {
      logger.warn(`Database connection failed. Will use API or mock data as fallback.`);
    }
  } catch (error) {
    logger.error(`Error checking database connection:`, {
      error: error.message,
      stack: error.stack
    });
  }
}

// Handle graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  logger.info('Received shutdown signal, closing server...');
  
  // Stop the background monitoring service
  monitoringService.stopMonitoring();
  logger.info('Monitoring service stopped');
  
  server.close(() => {
    logger.info('Server closed');
    
    // Close SQL pool if it exists
    if (global.sqlPool) {
      logger.info('Closing SQL connection pool...');
      global.sqlPool.close().then(() => {
        logger.info('SQL connection pool closed');
        process.exit(0);
      }).catch(err => {
        logger.error('Error closing SQL connection pool:', err);
        process.exit(1);
      });
    } else {
      process.exit(0);
    }
  });
  
  // Force close if taking too long
  setTimeout(() => {
    logger.error('Forcing server shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle uncaught exceptions with improved error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', {
    error: error.message,
    stack: error.stack
  });
  
  // Log additional diagnostic information
  logger.error('Diagnostic information at time of uncaught exception:', {
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });
  
  // In production, try to keep the server running
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Attempting to keep server running despite uncaught exception');
  } else {
    // In development, exit to make errors more visible
    logger.warn('Exiting process due to uncaught exception in development mode');
    setTimeout(() => process.exit(1), 1000);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection:', {
    reason: reason ? (reason.stack || reason.message || reason) : 'Unknown reason',
    promise
  });
  
  // Log additional context
  logger.error('Context at time of unhandled rejection:', {
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

export default app;