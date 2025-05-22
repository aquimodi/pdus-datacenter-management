import express from 'express';
import os from 'os';
import { setupLogger } from '../utils/logger.js';
import { pingDatabase } from '../config/db.js';
import { getCircuitBreakerStatus, isApiReachable, diagnoseApiEndpoint } from '../utils/api.js';
import monitoringService from '../services/monitoringService.js';
import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const logger = setupLogger();
const LOG_DIR = join(dirname(dirname(__dirname)), 'logs');

/**
 * @route GET /api/system/status
 * @desc Get comprehensive system status
 * @access Public
 */
router.get('/status', async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId;
  
  logger.info(`System status check requested`, { requestId });
  
  try {
    // Check database connectivity
    const dbConnected = await pingDatabase();
    
    // Check external APIs
    const [api1Reachable, api2Reachable] = await Promise.all([
      isApiReachable(process.env.API1_URL),
      isApiReachable(process.env.API2_URL)
    ]);
    
    // Get circuit breaker status
    const circuitBreakers = getCircuitBreakerStatus();
    
    // Get monitoring service status
    const monitoringStatus = monitoringService.getMonitoringStatus();
    
    // Check for log files
    const logStats = await getLogFileStats();
    
    // Get system information
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
    
    const duration = Date.now() - startTime;
    
    logger.info(`System status check completed in ${duration}ms`, {
      requestId,
      dbConnected,
      api1Reachable: api1Reachable,
      api2Reachable: api2Reachable
    });
    
    res.status(200).json({
      status: 'Success',
      timestamp: new Date(),
      duration: `${duration}ms`,
      database: {
        connected: dbConnected,
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE
      },
      apis: {
        api1: {
          url: process.env.API1_URL,
          reachable: api1Reachable
        },
        api2: {
          url: process.env.API2_URL,
          reachable: api2Reachable
        }
      },
      monitoring: monitoringStatus,
      circuitBreakers,
      server: systemInfo,
      logs: logStats
    });
  } catch (error) {
    logger.error(`Error in system status check:`, {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error checking system status: ${error.message}`
    });
  }
});

/**
 * @route POST /api/system/monitoring
 * @desc Control the monitoring service
 * @access Public
 */
router.post('/monitoring', async (req, res) => {
  const { action, interval } = req.body;
  const requestId = req.requestId;
  
  logger.info(`Monitoring service control requested: ${action}`, { 
    requestId,
    action,
    interval 
  });
  
  try {
    if (action === 'start') {
      monitoringService.startMonitoring(interval || 300000);
      res.status(200).json({
        status: 'Success',
        message: `Monitoring service started with interval of ${interval || 300000}ms`
      });
    } else if (action === 'stop') {
      monitoringService.stopMonitoring();
      res.status(200).json({
        status: 'Success',
        message: 'Monitoring service stopped'
      });
    } else if (action === 'run-now') {
      await monitoringService.runMonitoringCycle();
      res.status(200).json({
        status: 'Success',
        message: 'Monitoring cycle executed'
      });
    } else {
      res.status(400).json({
        status: 'Error',
        message: 'Invalid action. Use "start", "stop", or "run-now".'
      });
    }
  } catch (error) {
    logger.error(`Error controlling monitoring service:`, {
      requestId,
      action,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error controlling monitoring service: ${error.message}`
    });
  }
});

/**
 * @route GET /api/system/logs
 * @desc Get server logs
 * @access Public
 */
router.get('/logs', async (req, res) => {
  const { type = 'combined', lines = 100 } = req.query;
  const requestId = req.requestId;
  
  logger.info(`Log retrieval requested`, {
    requestId,
    type,
    lines
  });
  
  try {
    // Validate the log type for security
    const allowedLogTypes = ['combined', 'error', 'debug', 'api', 'access'];
    if (!allowedLogTypes.includes(type)) {
      logger.warn(`Invalid log type requested: ${type}`, { requestId });
      return res.status(400).json({
        status: 'Error',
        message: `Invalid log type. Allowed types: ${allowedLogTypes.join(', ')}`
      });
    }
    
    const logFile = join(LOG_DIR, `${type}.log`);
    
    // Check if the file exists
    if (!fs.existsSync(logFile)) {
      logger.warn(`Log file not found: ${logFile}`, { requestId });
      return res.status(404).json({
        status: 'Error',
        message: `Log file '${type}.log' not found`
      });
    }
    
    // Read the last N lines
    const maxLines = Math.min(parseInt(lines), 1000); // Cap at 1000 lines
    
    // Use simple tail implementation
    const fileSize = fs.statSync(logFile).size;
    const buffer = Buffer.alloc(Math.min(fileSize, 1024 * 1024)); // Read at most 1MB
    const fd = fs.openSync(logFile, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, fileSize - buffer.length));
    fs.closeSync(fd);
    
    let content = buffer.toString('utf8', 0, bytesRead);
    
    // Split by lines and get the last N lines
    const allLines = content.split('\n').filter(line => line.trim());
    const tailLines = allLines.slice(-maxLines).join('\n');
    
    logger.info(`Retrieved ${allLines.slice(-maxLines).length} lines from ${type}.log`, {
      requestId,
      logFile,
      linesRequested: maxLines,
      linesReturned: allLines.slice(-maxLines).length
    });
    
    res.status(200).json({
      status: 'Success',
      type,
      logs: tailLines
    });
  } catch (error) {
    logger.error(`Error retrieving logs:`, {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error retrieving logs: ${error.message}`
    });
  }
});

/**
 * @route GET /api/system/diagnose
 * @desc Run comprehensive diagnostics
 * @access Public
 */
router.get('/diagnose', async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId;
  
  logger.info(`System diagnostics requested`, { requestId });
  
  try {
    // Run diagnostics in parallel
    const [
      dbStatus,
      api1Diagnosis,
      api2Diagnosis,
      circuitBreakers
    ] = await Promise.all([
      pingDatabase(),
      diagnoseApiEndpoint(process.env.API1_URL),
      diagnoseApiEndpoint(process.env.API2_URL),
      Promise.resolve(getCircuitBreakerStatus())
    ]);
    
    // Get monitoring service status
    const monitoringStatus = monitoringService.getMonitoringStatus();
    
    // Get server stats
    const serverStats = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      osUptime: os.uptime(),
      osTotalMemory: os.totalmem(),
      osFreeMemory: os.freemem(),
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg()
    };
    
    // Check for log files
    const logStats = await getLogFileStats();
    
    const duration = Date.now() - startTime;
    
    logger.info(`System diagnostics completed in ${duration}ms`, {
      requestId,
      dbConnected: dbStatus,
      api1Reachable: api1Diagnosis.isReachable,
      api2Reachable: api2Diagnosis.isReachable
    });
    
    // Compile the diagnostic report
    const diagnosticReport = {
      timestamp: new Date(),
      duration: `${duration}ms`,
      overall: {
        status: dbStatus && api1Diagnosis.isReachable && api2Diagnosis.isReachable ? 'Healthy' : 'Issues Detected',
        issues: [
          !dbStatus ? 'Database connection failed' : null,
          !api1Diagnosis.isReachable ? 'API1 is unreachable' : null,
          !api2Diagnosis.isReachable ? 'API2 is unreachable' : null
        ].filter(Boolean)
      },
      database: {
        connected: dbStatus,
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE
      },
      apis: {
        api1: api1Diagnosis,
        api2: api2Diagnosis
      },
      monitoring: monitoringStatus,
      circuitBreakers,
      server: serverStats,
      logs: logStats
    };
    
    res.status(200).json({
      status: 'Success',
      diagnostics: diagnosticReport
    });
  } catch (error) {
    logger.error(`Error running system diagnostics:`, {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error running system diagnostics: ${error.message}`
    });
  }
});

/**
 * Helper function to get stats on log files
 */
async function getLogFileStats() {
  try {
    // Check if log directory exists
    if (!fs.existsSync(LOG_DIR)) {
      return { error: 'Log directory not found' };
    }
    
    // Get list of log files
    const files = fs.readdirSync(LOG_DIR).filter(file => file.endsWith('.log'));
    
    // Get stats for each file
    const stats = {};
    
    for (const file of files) {
      const filePath = join(LOG_DIR, file);
      const fileStat = fs.statSync(filePath);
      
      stats[file] = {
        size: fileStat.size,
        sizeFormatted: formatBytes(fileStat.size),
        modified: fileStat.mtime,
        created: fileStat.birthtime
      };
    }
    
    return stats;
  } catch (error) {
    logger.error(`Error getting log file stats:`, {
      error: error.message,
      stack: error.stack
    });
    
    return { error: error.message };
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default router;