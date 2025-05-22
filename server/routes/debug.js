import express from 'express';
import { diagnoseApiEndpoint, isApiReachable } from '../utils/api.js';
import { setupLogger } from '../utils/logger.js';
import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();
const logger = setupLogger();

// Path to HTTP logs
const httpLogDir = join(dirname(dirname(__dirname)), 'logs', 'http');

/**
 * @route GET /api/debug/api-diagnosis
 * @desc Diagnose an API endpoint for troubleshooting
 * @access Public
 */
router.get('/api-diagnosis', async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId;
  
  try {
    const { url, includeResponse } = req.query;
    
    if (!url) {
      return res.status(400).json({
        status: "Error",
        message: "URL parameter is required"
      });
    }
    
    logger.info(`[${requestId}] Diagnosing API endpoint: ${url}`, { requestId, url });
    
    const diagnosis = await diagnoseApiEndpoint(url, includeResponse === 'true');
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Add debug information to response headers
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(200).json({
      status: "Success",
      diagnosis
    });
  } catch (error) {
    // Log error
    logger.error(`[${requestId}] Error diagnosing API:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Add debug information to response headers
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: error.message
    });
  }
});

/**
 * @route GET /api/debug/call-external
 * @desc Test calling an external API with full error details
 * @access Public
 */
router.get('/call-external', async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId;
  
  try {
    const { url, method = 'GET', timeout = 10000 } = req.query;
    
    if (!url) {
      return res.status(400).json({
        status: "Error",
        message: "URL parameter is required"
      });
    }
    
    logger.info(`[${requestId}] Testing external API call to: ${url}`, {
      requestId,
      url,
      method,
      timeout
    });
    
    // Extract authentication from environment variables
    const apiKey = process.env.API_KEY;
    
    // Set up headers with authentication if available
    const headers = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    headers['Accept'] = 'application/json';
    headers['X-Request-ID'] = requestId;
    
    // Log full headers being sent
    logger.debug(`[${requestId}] Request headers:`, {
      requestId,
      headers: {
        ...headers,
        Authorization: headers.Authorization ? '[REDACTED]' : undefined
      }
    });
    
    // Make the request
    const axios = (await import('axios')).default;
    const axiosConfig = {
      method,
      url,
      headers,
      timeout: parseInt(timeout),
      validateStatus: () => true, // Accept any status code for debugging
      maxRedirects: 5
    };
    
    try {
      logger.debug(`[${requestId}] Sending request`, {
        requestId,
        config: {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            Authorization: '[REDACTED]'
          }
        }
      });
      
      const response = await axios(axiosConfig);
      
      // Format the response details
      const responseDetails = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        timing: {
          total: Date.now() - startTime
        }
      };
      
      logger.info(`[${requestId}] External API call succeeded: ${response.status}`, {
        requestId,
        url,
        status: response.status,
        statusText: response.statusText,
        responseTime: Date.now() - startTime
      });
      
      logger.debug(`[${requestId}] Response headers:`, {
        requestId,
        headers: response.headers
      });
      
      logger.debug(`[${requestId}] Response data:`, {
        requestId,
        data: response.data
      });
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Add debug information to response headers
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      res.status(200).json({
        status: "Success",
        requestConfig: {
          url,
          method,
          timeout,
          headers: { ...headers, Authorization: '[REDACTED]' }
        },
        response: responseDetails
      });
    } catch (axiosError) {
      // Format the error details
      const errorDetails = {
        message: axiosError.message,
        code: axiosError.code,
        isAxiosError: axiosError.isAxiosError,
        request: axiosError.request ? {
          method: axiosError.config?.method,
          url: axiosError.config?.url,
          headers: axiosError.config?.headers ? {
            ...axiosError.config.headers,
            Authorization: '[REDACTED]'
          } : null,
          data: axiosError.config?.data
        } : null,
        response: axiosError.response ? {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          headers: axiosError.response.headers,
          data: axiosError.response.data
        } : null,
        timing: {
          total: Date.now() - startTime
        }
      };
      
      logger.error(`[${requestId}] External API call failed: ${axiosError.message}`, {
        requestId,
        url,
        error: axiosError.message,
        code: axiosError.code,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        responseData: axiosError.response?.data
      });
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Add debug information to response headers
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      res.status(200).json({
        status: "Error",
        requestConfig: {
          url,
          method,
          timeout,
          headers: { ...headers, Authorization: '[REDACTED]' }
        },
        error: errorDetails
      });
    }
  } catch (error) {
    // Log error
    logger.error(`[${requestId}] Unexpected error:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Add debug information to response headers
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: error.message
    });
  }
});

/**
 * @route GET /api/debug/http-logs
 * @desc Get HTTP request/response logs
 * @access Public
 */
router.get('/http-logs', async (req, res) => {
  const { requestId, limit = 20 } = req.query;
  
  try {
    logger.info(`[${req.requestId}] Fetching HTTP logs`, {
      requestId: req.requestId,
      searchRequestId: requestId,
      limit
    });
    
    // Ensure HTTP logs directory exists
    if (!fs.existsSync(httpLogDir)) {
      logger.warn(`[${req.requestId}] HTTP log directory not found`, {
        requestId: req.requestId,
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
    const filteredFiles = requestId 
      ? files.filter(file => file.includes(requestId))
      : files.slice(0, parseInt(limit) * 2); // *2 because each request has req and res files
    
    logger.debug(`[${req.requestId}] Found ${filteredFiles.length} log files`, {
      requestId: req.requestId,
      fileCount: filteredFiles.length
    });
    
    // Process files to pair requests with responses
    const logs = [];
    for (let i = 0; i < filteredFiles.length; i += 2) {
      if (i + 1 >= filteredFiles.length) break;
      
      const reqFilePath = join(httpLogDir, filteredFiles[i]);
      const resFilePath = join(httpLogDir, filteredFiles[i + 1]);
      
      try {
        const reqContent = JSON.parse(fs.readFileSync(reqFilePath, 'utf8'));
        const resContent = JSON.parse(fs.readFileSync(resFilePath, 'utf8'));
        
        logs.push({
          id: reqContent.id,
          timestamp: reqContent.timestamp,
          method: reqContent.method,
          url: reqContent.url,
          statusCode: resContent.status,
          responseTime: resContent.responseTime,
          request: reqContent,
          response: resContent
        });
      } catch (error) {
        logger.error(`[${req.requestId}] Error reading log files`, {
          requestId: req.requestId,
          error: error.message,
          reqFile: filteredFiles[i],
          resFile: filteredFiles[i + 1]
        });
      }
    }
    
    logger.info(`[${req.requestId}] Returning ${logs.length} HTTP log entries`, {
      requestId: req.requestId,
      count: logs.length
    });
    
    res.status(200).json({
      status: 'Success',
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    logger.error(`[${req.requestId}] Error fetching HTTP logs`, {
      requestId: req.requestId,
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
 * @route GET /api/debug/env-check
 * @desc Check environment variables (redacted for security)
 * @access Public
 */
router.get('/env-check', (req, res) => {
  const envVars = {
    // Server configuration
    NODE_ENV: process.env.NODE_ENV,
    SERVER_PORT: process.env.SERVER_PORT,
    
    // API URLs (not sensitive)
    API1_URL: process.env.API1_URL,
    API2_URL: process.env.API2_URL,
    
    // API credentials (redacted)
    API_KEY: process.env.API_KEY ? '[REDACTED]' : 'not set',
    
    // Database configuration (partially redacted)
    SQL_SERVER: process.env.SQL_SERVER,
    SQL_DATABASE: process.env.SQL_DATABASE,
    SQL_USER: process.env.SQL_USER ? '[REDACTED]' : 'not set',
    SQL_PASSWORD: process.env.SQL_PASSWORD ? '[REDACTED]' : 'not set',
    SQL_PORT: process.env.SQL_PORT || 'default'
  };
  
  logger.info(`[${req.requestId}] Environment variables checked`, {
    requestId: req.requestId
  });
  
  res.status(200).json({
    status: "Success",
    environment: envVars
  });
});

/**
 * @route GET /api/debug/log-test
 * @desc Test logging at different levels
 * @access Public
 */
router.get('/log-test', (req, res) => {
  const { level = 'info', message = 'Test log message' } = req.query;
  
  logger.info(`[${req.requestId}] Log test requested at level ${level}`, {
    requestId: req.requestId,
    level,
    message
  });
  
  switch (level.toLowerCase()) {
    case 'error':
      logger.error(message, { requestId: req.requestId, source: 'log-test' });
      break;
    case 'warn':
      logger.warn(message, { requestId: req.requestId, source: 'log-test' });
      break;
    case 'debug':
      logger.debug(message, { requestId: req.requestId, source: 'log-test' });
      break;
    case 'info':
    default:
      logger.info(message, { requestId: req.requestId, source: 'log-test' });
      break;
  }
  
  res.status(200).json({
    status: "Success",
    message: `Log created at level: ${level}`,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

/**
 * @route GET /api/debug/api-connectivity
 * @desc Check connectivity to configured APIs
 * @access Public
 */
router.get('/api-connectivity', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const api1Url = process.env.API1_URL;
    const api2Url = process.env.API2_URL;
    
    logger.info(`[${req.requestId}] Checking API connectivity`, {
      requestId: req.requestId,
      api1Url,
      api2Url
    });
    
    const [api1Reachable, api2Reachable] = await Promise.all([
      isApiReachable(api1Url),
      isApiReachable(api2Url)
    ]);
    
    const responseTime = Date.now() - startTime;
    
    logger.info(`[${req.requestId}] API connectivity check completed in ${responseTime}ms`, {
      requestId: req.requestId,
      api1Reachable,
      api2Reachable,
      responseTime
    });
    
    res.status(200).json({
      status: "Success",
      requestId: req.requestId,
      connectivity: {
        api1: {
          url: api1Url,
          reachable: api1Reachable
        },
        api2: {
          url: api2Url,
          reachable: api2Reachable
        }
      },
      checkTime: responseTime
    });
  } catch (error) {
    logger.error(`[${req.requestId}] Error checking API connectivity:`, error);
    
    res.status(500).json({
      status: "Error",
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * @route GET /api/debug/request-replay/:requestId
 * @desc Replay a previous request
 * @access Public
 */
router.get('/request-replay/:requestId', async (req, res) => {
  const { requestId } = req.params;
  
  try {
    logger.info(`[${req.requestId}] Attempting to replay request ${requestId}`, {
      requestId: req.requestId,
      replayRequestId: requestId
    });
    
    // Find request log file
    const files = fs.readdirSync(httpLogDir);
    const reqFile = files.find(file => file.startsWith(`req_${requestId}`));
    
    if (!reqFile) {
      logger.warn(`[${req.requestId}] Request log file not found for ${requestId}`, {
        requestId: req.requestId,
        replayRequestId: requestId
      });
      
      return res.status(404).json({
        status: 'Error',
        message: `Request log for ID ${requestId} not found`
      });
    }
    
    // Read the request file
    const reqLogFile = join(httpLogDir, reqFile);
    const requestLog = JSON.parse(fs.readFileSync(reqLogFile, 'utf8'));
    
    logger.info(`[${req.requestId}] Found request log for ${requestId}`, {
      requestId: req.requestId,
      replayRequestId: requestId,
      originalRequest: {
        method: requestLog.method,
        url: requestLog.url,
        timestamp: requestLog.timestamp
      }
    });
    
    // Make a new request based on the logged request
    const axios = (await import('axios')).default;
    
    // Prepare the URL
    let replayUrl = requestLog.url;
    if (!replayUrl.startsWith('http')) {
      // Assume it's a relative URL and prepend the server URL
      replayUrl = `http://localhost:${process.env.SERVER_PORT || 3000}${replayUrl}`;
    }
    
    logger.info(`[${req.requestId}] Replaying request to ${replayUrl}`, {
      requestId: req.requestId,
      method: requestLog.method,
      url: replayUrl
    });
    
    const axiosConfig = {
      method: requestLog.method,
      url: replayUrl,
      headers: {
        ...requestLog.headers,
        'X-Replay-Original-Request-ID': requestId,
        'X-Replay-Request-ID': req.requestId
      },
      data: requestLog.body,
      validateStatus: () => true, // Accept any status code
      timeout: 10000
    };
    
    // Do not replay authorization headers for security
    if (axiosConfig.headers.authorization) {
      delete axiosConfig.headers.authorization;
    }
    
    // Send the request
    const response = await axios(axiosConfig);
    
    // Log replay results
    logger.info(`[${req.requestId}] Request replay completed: ${response.status}`, {
      requestId: req.requestId,
      status: response.status,
      statusText: response.statusText,
      responseTime: Date.now() - startTime
    });
    
    res.status(200).json({
      status: 'Success',
      originalRequest: {
        id: requestId,
        method: requestLog.method,
        url: requestLog.url,
        timestamp: requestLog.timestamp
      },
      replayResult: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        responseTime: Date.now() - startTime
      }
    });
  } catch (error) {
    logger.error(`[${req.requestId}] Error replaying request ${requestId}:`, {
      requestId: req.requestId,
      replayRequestId: requestId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'Error',
      message: `Error replaying request: ${error.message}`
    });
  }
});

export default router;