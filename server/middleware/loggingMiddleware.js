import { setupLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = setupLogger();

/**
 * Middleware to log detailed request and response information
 */
export const loggingMiddleware = (req, res, next) => {
  // Generate a unique ID for this request if it doesn't already have one
  req.requestId = req.requestId || req.headers['x-request-id'] || uuidv4();
  
  // Add request ID to response headers
  res.set('X-Request-ID', req.requestId);
  
  // Record start time if not already set
  req.startTime = req.startTime || Date.now();

  // Log request details with context - NO REDACTION
  logger.info(`Request started: ${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    params: req.params,
    query: req.query,
    body: req.body,
    headers: req.headers,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Capture the original send method
  const originalSend = res.send;
  
  // Override the send method to log response details
  res.send = function(body) {
    // Calculate response time
    const responseTime = Date.now() - req.startTime;
    
    // Determine if response is JSON
    let responseBody;
    try {
      if (typeof body === 'string') {
        responseBody = JSON.parse(body);
      } else {
        responseBody = body;
      }
    } catch (e) {
      // Not JSON, leave as is
      responseBody = body ? (typeof body === 'string' ? body : '[BINARY DATA]') : '[EMPTY BODY]';
    }

    // Log response details - NO REDACTION
    logger.info(`Response sent: ${req.method} ${req.originalUrl} ${res.statusCode} - ${responseTime}ms`, {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      responseHeaders: res.getHeaders(),
      contentType: res.getHeader('content-type'),
      contentLength: res.getHeader('content-length'),
      timestamp: new Date().toISOString()
    });

    // If this is an API endpoint, log more details
    if (req.path.startsWith('/api')) {
      logger.debug(`API Response Details [${req.requestId}]`, {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime,
        contentType: res.getHeader('content-type'),
        responseBody: responseBody
      });
    }

    // Call the original send method
    return originalSend.call(this, body);
  };

  next();
};

/**
 * Middleware to log errors in a detailed format
 */
export const errorLoggingMiddleware = (err, req, res, next) => {
  const responseTime = Date.now() - (req.startTime || Date.now());
  
  logger.error(`Error occurred: ${req.method} ${req.originalUrl} - ${err.message}`, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode: err.status || 500,
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack,
      code: err.code
    },
    responseTime,
    timestamp: new Date().toISOString()
  });
  
  next(err);
};

export default { loggingMiddleware, errorLoggingMiddleware };