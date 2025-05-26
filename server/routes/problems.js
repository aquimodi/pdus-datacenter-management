import express from 'express';
import { getProblems } from '../config/db.js';
import { setupLogger } from '../utils/logger.js';

const router = express.Router();
const logger = setupLogger();

/**
 * Helper function to enhance problem data with severity and current value
 */
const enhanceProblemsData = (problems) => {
  return problems.map(problem => {
    // Add severity based on problem type and value
    let severity;
    const valueStr = problem.value.replace(/[^0-9.]/g, ''); // Extract numeric part
    const value = parseFloat(valueStr);
    
    if (problem.type === 'Temperature') {
      severity = value > 35 ? 'High' : value > 32 ? 'Medium' : 'Low';
    } else if (problem.type === 'Humidity') {
      severity = value > 75 ? 'High' : value > 70 ? 'Medium' : 'Low';
    } else if (problem.type === 'Power') {
      severity = value > 20 ? 'High' : value > 16 ? 'Medium' : 'Low';
    } else {
      severity = 'Medium';
    }
    
    // Format current value (slightly lower than problem value for UI display)
    let currentValue;
    if (problem.alert_type === 'high') {
      if (problem.type === 'Temperature') {
        currentValue = `${(value * 0.98).toFixed(1)}°C`;
      } else if (problem.type === 'Humidity') {
        currentValue = `${(value * 0.95).toFixed(0)}%`;
      } else {
        currentValue = `${(value * 0.97).toFixed(1)}A`;
      }
    } else {
      // For low alerts, current value is slightly higher than the alert value
      if (problem.type === 'Temperature') {
        currentValue = `${(value * 1.05).toFixed(1)}°C`;
      } else if (problem.type === 'Humidity') {
        currentValue = `${(value * 1.05).toFixed(0)}%`;
      } else {
        currentValue = `${(value * 1.05).toFixed(1)}A`;
      }
    }
    
    return {
      ...problem,
      severity,
      currentValue
    };
  });
};

/**
 * @route GET /api/problems
 * @desc Get problems data (current or historical)
 * @access Public
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Apply CORS headers specifically for this route
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  
  try {
    // Check for historical param (defaults to false - current problems)
    const isHistorical = req.query.historical === 'true';
    
    logger.info(`[${requestId}] Fetching ${isHistorical ? 'historical' : 'current'} problems data.`);
    
    try {
      // Get real data from database
      const data = await getProblems(isHistorical);
      
      // Log the raw data for debugging
      logger.debug(`[${requestId}] Raw problems data from database:`, {
        count: data.length,
        first: data.length > 0 ? data[0] : null
      });
      
      // Enhance data with severity and current values
      const enhancedData = enhanceProblemsData(data);
      
      logger.info(`[${requestId}] Retrieved ${enhancedData.length} ${isHistorical ? 'historical' : 'current'} problems from database`);
      
      // Format response
      const response = {
        status: "Success",
        data: enhancedData
      };
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Log for debug panel
      const debugLog = {
        id: requestId,
        timestamp: new Date().toISOString(),
        endpoint: '/api/problems',
        method: 'GET',
        status: 200,
        responseTime,
        requestBody: { historical: isHistorical },
        responseBody: response
      };
      
      // Include debug information in response headers
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      if (req.headers['x-debug'] === 'true') {
        response.debug = debugLog;
      }
      
      res.status(200).json(response);
    } catch (dbError) {
      // If database access fails, log the error
      logger.error(`[${requestId}] Database access failed: ${dbError.message}.`, {
        error: dbError.message,
        stack: dbError.stack
      });
      
      throw dbError;
    }
  } catch (error) {
    logger.error(`[${requestId}] Error fetching ${req.query.historical === 'true' ? 'historical' : 'current'} problems data:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: '/api/problems',
      method: 'GET',
      status: 500,
      responseTime,
      requestBody: { 
        historical: req.query.historical === 'true'
      },
      error: error.message
    };
    
    // Include debug information in response headers
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: error.message,
      debug: debugLog
    });
  }
});

/**
 * @route GET /api/problems/:id
 * @desc Get a specific problem by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Apply CORS headers specifically for this route
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  
  try {
    const { id } = req.params;
    logger.info(`[${requestId}] Fetching problem data for ID: ${id}`);
    
    // Implementation for specific problem data
    // This would need to be implemented with a specific SQL query
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: `/api/problems/${id}`,
      method: 'GET',
      status: 501,
      responseTime
    };
    
    // Include debug information in response headers
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(501).json({
      status: "Not Implemented",
      message: "This endpoint is planned for future implementation",
      debug: debugLog
    });
  } catch (error) {
    logger.error(`[${requestId}] Error fetching problem data for ID ${req.params.id}:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: `/api/problems/${req.params.id}`,
      method: 'GET',
      status: 500,
      responseTime,
      error: error.message
    };
    
    // Include debug information in response headers
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: error.message,
      debug: debugLog
    });
  }
});

export default router;