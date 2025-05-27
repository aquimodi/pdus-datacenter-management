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
    const allowedLogTypes = ['combined', 'error', 'debug', 'api', 'access', 'http', 'monitoring'];
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
 * @route GET /api/system/http-logs
 * @desc Get HTTP request/response logs
 * @access Public
 */
router.get('/http-logs', async (req, res) => {
  const { requestId: searchRequestId, limit = 20 } = req.query;
  const requestId = req.requestId;
  
  try {
    logger.info(`[${requestId}] Fetching HTTP logs`, {
      requestId,
      searchRequestId: searchRequestId,
      limit
    });
    
    // Ensure HTTP logs directory exists
    const httpLogDir = join(LOG_DIR, 'http');
    if (!fs.existsSync(httpLogDir)) {
      logger.warn(`[${requestId}] HTTP log directory not found`, {
        requestId,
        dir: httpLogDir
      });
      
      return res.status(404).json({
        status: 'Error',
        message: 'HTTP logs directory not found'
      });
    }
    
    // Read all log files in the directory
    const files = fs.readdirSync(httpLogDir)
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => {
        // Sort by creation time (newest first)
        return fs.statSync(join(httpLogDir, b)).mtime.getTime() - 
               fs.statSync(join(httpLogDir, a)).mtime.getTime();
      });
    
    // Filter by request ID if provided
    const filteredFiles = searchRequestId 
      ? files.filter(file => file.includes(searchRequestId))
      : files.slice(0, parseInt(limit) * 2); // *2 because each request has req and res files
    
    logger.debug(`[${requestId}] Found ${filteredFiles.length} log files`, {
      requestId,
      fileCount: filteredFiles.length
    });
    
    // Process files to pair requests with responses
    const logs = [];
    const processedRequestIds = new Set();
    
    for (const file of filteredFiles) {
      try {
        const filePath = join(httpLogDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Check if we already processed this request ID
        if (processedRequestIds.has(content.id)) {
          continue;
        }
        
        // Find the matching request/response pair
        const isRequest = file.startsWith('req_');
        const partnerId = content.id;
        const partnerPrefix = isRequest ? 'res_' : 'req_';
        
        const partnerFile = files.find(f => f.startsWith(partnerPrefix) && f.includes(partnerId));
        
        if (partnerFile) {
          const partnerFilePath = join(httpLogDir, partnerFile);
          const partnerContent = JSON.parse(fs.readFileSync(partnerFilePath, 'utf8'));
          
          const requestContent = isRequest ? content : partnerContent;
          const responseContent = isRequest ? partnerContent : content;
          
          logs.push({
            id: partnerId,
            timestamp: requestContent.timestamp,
            method: requestContent.method,
            url: requestContent.url,
            statusCode: responseContent.status,
            responseTime: responseContent.responseTime,
            request: requestContent,
            response: responseContent
          });
          
          // Mark as processed
          processedRequestIds.add(partnerId);
        } else {
          // If we can't find a partner, just add this one
          logs.push({
            id: content.id,
            timestamp: content.timestamp,
            method: isRequest ? content.method : 'Unknown',
            url: isRequest ? content.url : 'Unknown',
            statusCode: !isRequest ? content.status : 0,
            responseTime: !isRequest ? content.responseTime : '0ms',
            request: isRequest ? content : { id: content.id, message: 'Request log not found' },
            response: !isRequest ? content : { id: content.id, message: 'Response log not found' }
          });
          
          // Mark as processed
          processedRequestIds.add(content.id);
        }
        
        // Limit the number of logs
        if (logs.length >= parseInt(limit)) {
          break;
        }
      } catch (error) {
        logger.error(`[${requestId}] Error reading log file ${file}:`, {
          requestId,
          error: error.message,
          stack: error.stack
        });
      }
    }
    
    logger.info(`[${requestId}] Returning ${logs.length} HTTP log entries`, {
      requestId,
      count: logs.length
    });
    
    res.status(200).json({
      status: 'Success',
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    logger.error(`[${requestId}] Error fetching HTTP logs`, {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error fetching HTTP logs: ${error.message}`
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
 * @route GET /api/system/communication-test
 * @desc Test frontend-backend communication
 * @access Public
 */
router.get('/communication-test', (req, res) => {
  const requestId = req.requestId;
  const startTime = Date.now();
  
  logger.info(`Communication test requested`, { requestId });
  
  try {
    // Gather system information for the response
    const systemInfo = {
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      }
    };
    
    res.status(200).json({
      status: 'Success',
      message: 'Backend communication successful',
      requestHeaders: req.headers,
      requestTime: startTime,
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
      serverInfo: systemInfo,
      environment: process.env.NODE_ENV,
      serverPort: process.env.SERVER_PORT
    });
    
    logger.info(`Communication test completed successfully`, { 
      requestId,
      responseTime: Date.now() - startTime
    });
  } catch (error) {
    logger.error(`Error in communication test:`, {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error in communication test: ${error.message}`
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