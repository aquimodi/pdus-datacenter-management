import winston from 'winston';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const setupLogger = () => {
  // Create logs directory if it doesn't exist
  const logDir = join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Custom format for detailed logging with improved circular reference handling
  const detailedFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let metaStr = '';
    if (Object.keys(metadata).length > 0) {
      // Safely stringify metadata with circular reference handling
      try {
        const seen = new WeakSet();
        return JSON.stringify(metadata, (key, value) => {
          // Skip problematic keys that often contain circular references
          if (key === 'socket' || key === '_handle' || key === '_events' || key === '_eventsCount') {
            return '[skipped]';
          }
          
          // Handle circular references and function objects
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          if (typeof value === 'function') {
            return '[Function]';
          }
          if (typeof value === 'string' && value.length > 1000) {
            return value.substring(0, 1000) + '... [truncated]';
          }
          return value;
        });
      } catch (error) {
        metaStr = `[Error during JSON stringify: ${error.message}]`;
      }
    }
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`;
  });

  // Create the logger with enhanced configuration
  const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      // Use custom format to safely handle circular references
      winston.format((info) => {
        try {
          // Ensure we don't break on circular structures
          const safeInfo = { ...info };
          
          // Limit large object sizes to prevent memory issues
          if (safeInfo.metadata && typeof safeInfo.metadata === 'object') {
            const keys = Object.keys(safeInfo.metadata);
            keys.forEach(key => {
              const value = safeInfo.metadata[key];
              if (typeof value === 'string' && value.length > 5000) {
                safeInfo.metadata[key] = value.substring(0, 5000) + '... [truncated]';
              }
            });
          }
          
          return safeInfo;
        } catch (err) {
          return {
            level: info.level,
            message: info.message,
            timestamp: info.timestamp,
            error: `Error processing log entry: ${err.message}`
          };
        }
      })(),
      winston.format.json()
    ),
    defaultMeta: { service: 'dcops-api' },
    transports: [
      // Console transport with colorized output for development
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          detailedFormat
        )
      }),
      // Separate file for errors to make them easier to find
      new winston.transports.File({ 
        filename: join(logDir, 'error.log'), 
        level: 'error',
        maxsize: 2 * 1024 * 1024, // 2MB (reduced from 5MB)
        maxFiles: 5, // Reduced from 10
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          detailedFormat
        )
      }),
      // Detailed log for everything - with reduced file size
      new winston.transports.File({ 
        filename: join(logDir, 'combined.log'),
        maxsize: 2 * 1024 * 1024, // 2MB (reduced from 5MB)
        maxFiles: 5, // Reduced from 10
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          detailedFormat
        )
      }),
      // Specialized debug log file - with reduced file size
      new winston.transports.File({
        filename: join(logDir, 'debug.log'),
        level: 'debug',
        maxsize: 2 * 1024 * 1024, // 2MB (reduced from 5MB)
        maxFiles: 3, // Reduced from 5
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          detailedFormat
        )
      }),
      // API calls log file - with reduced file size
      new winston.transports.File({
        filename: join(logDir, 'api.log'),
        maxsize: 2 * 1024 * 1024, // 2MB (reduced from 5MB)
        maxFiles: 3, // Reduced from 5
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          detailedFormat
        )
      }),
      // Monitoring log file - new file dedicated to monitoring activities
      new winston.transports.File({
        filename: join(logDir, 'monitoring.log'),
        maxsize: 2 * 1024 * 1024, // 2MB
        maxFiles: 3,
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
          }),
          detailedFormat
        )
      })
    ]
  });

  // Add convenience methods for logging with context
  logger.apiCall = (message, data) => {
    try {
      logger.info(message, { 
        type: 'api_call', 
        ...(data || {})
      });
    } catch (error) {
      console.error(`Error in apiCall logger: ${error.message}`);
    }
  };

  logger.apiResponse = (message, data) => {
    try {
      // Limit data size for api responses
      let safeData = { ...(data || {}) };
      if (safeData.body && typeof safeData.body === 'string' && safeData.body.length > 2000) {
        safeData.body = safeData.body.substring(0, 2000) + '... [truncated]';
      }
      
      logger.info(message, { 
        type: 'api_response', 
        ...safeData
      });
    } catch (error) {
      console.error(`Error in apiResponse logger: ${error.message}`);
    }
  };

  logger.dbQuery = (message, data) => {
    try {
      logger.debug(message, { 
        type: 'db_query', 
        ...(data || {})
      });
    } catch (error) {
      console.error(`Error in dbQuery logger: ${error.message}`);
    }
  };

  logger.dbError = (message, error, query) => {
    try {
      // Trim query if it's too large
      let safeQuery = query;
      if (typeof query === 'string' && query.length > 2000) {
        safeQuery = query.substring(0, 2000) + '... [truncated]';
      }
      
      logger.error(message, { 
        type: 'db_error', 
        query: safeQuery, 
        error: error?.message || String(error), 
        stack: error?.stack
      });
    } catch (err) {
      console.error(`Error in dbError logger: ${err.message}`);
    }
  };

  logger.requestStart = (req) => {
    try {
      // Safely extract request information, avoiding circular references and limiting data size
      const safeHeaders = req.headers ? { ...req.headers } : {};
      const safeQuery = req.query ? { ...req.query } : {};
      
      // Skip logging body to reduce memory usage
      logger.info(`Request started: ${req.method} ${req.originalUrl}`, {
        type: 'request_start',
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        headers: safeHeaders,
        query: safeQuery
      });
    } catch (error) {
      console.error(`Error in requestStart logger: ${error.message}`);
    }
  };

  logger.requestEnd = (req, res, time) => {
    try {
      logger.info(`Request completed: ${req.method} ${req.originalUrl} ${res.statusCode} (${time}ms)`, {
        type: 'request_end',
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: time
      });
    } catch (error) {
      console.error(`Error in requestEnd logger: ${error.message}`);
    }
  };

  // New method for monitoring logs
  logger.monitoring = (message, data) => {
    try {
      logger.info(message, {
        type: 'monitoring',
        ...(data || {})
      });
    } catch (error) {
      console.error(`Error in monitoring logger: ${error.message}`);
    }
  };

  return logger;
};

// Create a logger instance for use in browser-bundled code
export const createClientLogger = () => {
  return {
    debug: (message, ...args) => console.debug(`[DEBUG] ${message}`, ...args),
    info: (message, ...args) => console.info(`[INFO] ${message}`, ...args),
    warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args),
    error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args),
    apiCall: (message, data) => console.info(`[API_CALL] ${message}`, data),
    apiResponse: (message, data) => console.info(`[API_RESPONSE] ${message}`, data),
    apiError: (message, error) => console.error(`[API_ERROR] ${message}`, error),
    monitoring: (message, data) => console.info(`[MONITORING] ${message}`, data)
  };
};