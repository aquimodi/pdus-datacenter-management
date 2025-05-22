import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to add debug information to API requests
 */
export const debugMiddleware = (req, res, next) => {
  // Generate a unique ID for this request if it doesn't have one
  req.requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Add start time to request for later calculation of response time
  req.startTime = Date.now();
  
  // Store original send method
  const originalSend = res.send;
  
  // Override send method to add debug information
  res.send = function(body) {
    // Calculate response time
    const responseTime = Date.now() - req.startTime;
    
    // Add debug headers
    res.set('X-Debug-Id', req.requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    res.set('X-Debug-Path', req.originalUrl);
    
    // If client requested debug information (via header) and response is JSON
    if (req.headers['x-debug'] === 'true' && typeof body === 'string') {
      try {
        const parsedBody = JSON.parse(body);
        
        // Add debug information to the response
        parsedBody.debug = {
          requestId: req.requestId,
          path: req.originalUrl,
          method: req.method,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString()
        };
        
        // Convert back to string
        body = JSON.stringify(parsedBody);
      } catch (e) {
        // Not JSON or couldn't parse, leave it as is
      }
    }
    
    // Call original send
    return originalSend.call(this, body);
  };
  
  next();
};

export default debugMiddleware;