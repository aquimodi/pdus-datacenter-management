import { v4 as uuidv4 } from 'uuid';
import { setupLogger } from '../utils/logger.js';
import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = setupLogger();

// Ensure HTTP logs directory exists
const httpLogDir = join(dirname(dirname(__dirname)), 'logs', 'http');
if (!fs.existsSync(httpLogDir)) {
  try {
    fs.mkdirSync(httpLogDir, { recursive: true });
  } catch (error) {
    logger.warn(`Could not create HTTP logs directory: ${error.message}`);
  }
}

// Maximum size for request/response body logging (32KB)
const MAX_BODY_SIZE = 32 * 1024;

// Safely write data to a file with proper error handling
const safeWriteFile = (filePath, data) => {
  try {
    // Convert data to string if it's an object
    const content = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    
    // Use asynchronous file write to avoid blocking
    fs.writeFile(filePath, content, (err) => {
      if (err) {
        logger.error(`Failed to write to log file ${filePath}: ${err.message}`, { error: err });
      }
    });
    return true;
  } catch (error) {
    logger.error(`Failed to prepare log file data ${filePath}: ${error.message}`, { error });
    return false;
  }
};

// Safely stringify an object, handling circular references with improved error handling
const safeStringify = (obj) => {
  if (!obj) return '';
  
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      // Skip problematic keys immediately
      if (key === 'socket' || key === '_handle' || key === '_events' || key === '_eventsCount') {
        return '[skipped]';
      }
      
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      if (typeof value === 'function') {
        return '[Function]';
      }
      
      // For strings, truncate if too long
      if (typeof value === 'string' && value.length > 500) {
        return value.substring(0, 500) + '... [truncated]';
      }
      
      return value;
    }, 2);
  } catch (error) {
    return `[JSON stringify error: ${error.message}]`;
  }
};

// Convert buffer to string safely
const safeBufferToString = (buffer, encoding = 'utf8') => {
  if (!buffer) return '';
  
  try {
    // Check if it's a Buffer instance
    if (Buffer.isBuffer(buffer)) {
      // Check size first
      if (buffer.length > MAX_BODY_SIZE) {
        return `[Buffer of length ${buffer.length}, too large to include]`;
      }
      
      // Create a completely new buffer with a copy of the data
      // This avoids the detached ArrayBuffer issues
      const safeCopy = Buffer.alloc(buffer.length);
      
      try {
        // Use copy instead of set to avoid detached buffer errors
        buffer.copy(safeCopy);
        return safeCopy.toString(encoding);
      } catch (copyError) {
        // If copy fails, try a different approach
        return `[Buffer conversion error: ${copyError.message}]`;
      }
    } else if (typeof buffer === 'string') {
      return buffer.length > MAX_BODY_SIZE ? 
        buffer.substring(0, MAX_BODY_SIZE) + '... [truncated]' : buffer;
    } else {
      return String(buffer);
    }
  } catch (error) {
    logger.warn(`Error in safeBufferToString: ${error.message}`);
    return `[Buffer conversion error: ${error.message}]`;
  }
};

/**
 * Middleware to log detailed HTTP request and response with improved memory handling
 */
export const httpLoggingMiddleware = (req, res, next) => {
  try {
    // Generate a unique ID for this request if it doesn't have one
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.requestId = requestId;
    
    // Add request ID to response headers
    res.set('X-Request-ID', requestId);
    
    // Record start time
    req.startTime = Date.now();

    // Create request log file path
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reqLogFile = join(httpLogDir, `req_${requestId}_${timestamp}.json`);
    const resLogFile = join(httpLogDir, `res_${requestId}_${timestamp}.json`);
    
    // Create safe copies of request data
    const safeHeaders = Object.assign({}, req.headers || {});
    const safeParams = Object.assign({}, req.params || {});
    const safeQuery = Object.assign({}, req.query || {});
    let safeBody = null;
    
    try {
      if (req.body) {
        if (Buffer.isBuffer(req.body)) {
          safeBody = safeBufferToString(req.body);
        } else if (typeof req.body === 'object') {
          // Handle object bodies without JSON stringifying twice
          safeBody = {};
          // Shallow copy keys to avoid reference issues
          for (const key in req.body) {
            const val = req.body[key];
            if (typeof val === 'string' && val.length > MAX_BODY_SIZE) {
              safeBody[key] = val.substring(0, MAX_BODY_SIZE) + '... [truncated]';
            } else if (Buffer.isBuffer(val)) {
              safeBody[key] = safeBufferToString(val);
            } else if (typeof val === 'object' && val !== null) {
              safeBody[key] = '[Object]';
            } else {
              safeBody[key] = val;
            }
          }
        } else {
          // Handle primitive types
          safeBody = String(req.body);
        }
      }
    } catch (bodyError) {
      safeBody = `[Error accessing request body: ${bodyError.message}]`;
      logger.warn(`Error processing request body for logging: ${bodyError.message}`, {
        requestId,
        error: bodyError.stack
      });
    }
    
    // Log complete request details with safer handling
    const requestDetails = {
      id: requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      protocol: req.protocol,
      hostname: req.hostname,
      ip: req.ip,
      path: req.path,
      params: safeParams,
      query: safeQuery,
      body: safeBody,
      headers: safeHeaders
    };

    // Write request to file asynchronously with safe handling
    safeWriteFile(reqLogFile, requestDetails);
    
    logger.http(`HTTP Request [${requestId}]: ${req.method} ${req.originalUrl} from ${req.ip}`, {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip
    });

    // Store response body as limited-size strings instead of chunks of buffers
    let responseText = '';
    let responseSizeLimit = MAX_BODY_SIZE;
    let responseSize = 0;
    let responseExceededLimit = false;
    
    // Override write and end methods
    const originalWrite = res.write;
    const originalEnd = res.end;
    
    res.write = function(chunk, encoding, callback) {
      try {
        // Only process the chunk if we haven't exceeded our limit yet
        if (!responseExceededLimit && chunk) {
          let chunkStr = '';
          
          if (Buffer.isBuffer(chunk)) {
            try {
              // Create a new buffer with a copy of just what we need
              const size = Math.min(chunk.length, responseSizeLimit - responseSize);
              if (size > 0) {
                const copy = Buffer.alloc(size);
                chunk.copy(copy, 0, 0, size);
                chunkStr = copy.toString('utf8');
                responseSize += chunkStr.length;
              }
            } catch (err) {
              chunkStr = `[Buffer conversion error: ${err.message}]`;
            }
          } else if (typeof chunk === 'string') {
            const size = Math.min(chunk.length, responseSizeLimit - responseSize);
            if (size > 0) {
              chunkStr = chunk.substring(0, size);
              responseSize += chunkStr.length;
            }
          }
          
          if (chunkStr) {
            responseText += chunkStr;
            if (responseSize >= responseSizeLimit) {
              responseExceededLimit = true;
              responseText += '... [truncated]';
            }
          }
        }
      } catch (err) {
        logger.warn(`Error in write override: ${err.message}`, { 
          requestId,
          error: err.stack
        });
      }
      
      return originalWrite.apply(res, arguments);
    };
    
    res.end = function(chunk, encoding, callback) {
      try {
        // Handle final chunk if provided
        if (!responseExceededLimit && chunk) {
          let chunkStr = '';
          
          if (Buffer.isBuffer(chunk)) {
            try {
              // Create a new buffer with a copy of just what we need
              const size = Math.min(chunk.length, responseSizeLimit - responseSize);
              if (size > 0) {
                const copy = Buffer.alloc(size);
                chunk.copy(copy, 0, 0, size);
                chunkStr = copy.toString('utf8');
                responseSize += chunkStr.length;
              }
            } catch (err) {
              chunkStr = `[Buffer conversion error: ${err.message}]`;
            }
          } else if (typeof chunk === 'string') {
            const size = Math.min(chunk.length, responseSizeLimit - responseSize);
            if (size > 0) {
              chunkStr = chunk.substring(0, size);
              responseSize += chunkStr.length;
            }
          }
          
          if (chunkStr) {
            responseText += chunkStr;
            if (responseSize >= responseSizeLimit) {
              responseExceededLimit = true;
              responseText += '... [truncated]';
            }
          }
        }
        
        // Calculate response time
        const responseTime = Date.now() - req.startTime;
        
        // Get response headers safely
        const responseHeaders = {};
        try {
          const headers = res.getHeaders();
          for (const key in headers) {
            responseHeaders[key] = headers[key];
          }
        } catch (headersError) {
          logger.warn(`Error getting response headers: ${headersError.message}`);
        }
        
        // Process the response body more safely
        let responseBody = null;
        try {
          // Don't try to parse JSON unless we're confident it's valid JSON
          const contentType = res.getHeader('content-type');
          if (contentType && contentType.includes('application/json') && responseText.trim().startsWith('{')) {
            try {
              responseBody = JSON.parse(responseText);
            } catch (jsonError) {
              responseBody = responseText;
            }
          } else {
            responseBody = responseText;
          }
        } catch (err) {
          responseBody = '[Error processing response body]';
          logger.warn(`Error processing response body: ${err.message}`, { 
            requestId,
            error: err.stack
          });
        }
        
        // Log complete response details
        const responseDetails = {
          id: requestId,
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          status: res.statusCode,
          statusMessage: res.statusMessage,
          headers: responseHeaders,
          contentType: res.getHeader('content-type'),
          contentLength: res.getHeader('content-length'),
          actualSize: responseSize,
          truncated: responseExceededLimit,
          body: responseBody
        };
        
        // Write response to file safely and asynchronously
        safeWriteFile(resLogFile, responseDetails);
        
        // Log response summary
        logger.http(`HTTP Response [${requestId}]: ${req.method} ${req.originalUrl} ${res.statusCode} (${responseTime}ms)`, {
          requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          responseTime,
          contentType: res.getHeader('content-type'),
          contentLength: res.getHeader('content-length'),
          actualSize: responseSize,
          truncated: responseExceededLimit
        });
        
        // Clear captured response text to free memory
        responseText = '';
        responseBody = null;
      } catch (endError) {
        logger.error(`Error in response end handler: ${endError.message}`, {
          requestId,
          error: endError.stack
        });
      }

      // Call original end method
      return originalEnd.apply(res, arguments);
    };
  } catch (middlewareError) {
    logger.error(`Error in HTTP logging middleware: ${middlewareError.message}`, {
      error: middlewareError.stack
    });
  }

  next();
};

export default httpLoggingMiddleware;