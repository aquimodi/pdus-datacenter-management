import express from 'express';
import { getRacks } from '../config/db.js';
import { setupLogger } from '../utils/logger.js';
import { getDataWithFallback } from '../utils/api.js';
import axios from 'axios';

const router = express.Router();
const logger = setupLogger();

/**
 * Transform power API data to the internal format
 * @param {Array} powerData - Data from power API
 * @returns {Array} Transformed data
 */
const transformPowerData = (powerData, requestId) => {
  logger.info(`[${requestId}] Transforming power data: ${powerData.length} items`);
  
  try {
    return powerData.map(item => ({
      id: item.id?.toString() || '',
      rackId: item.rackId?.toString() || '',
      NAME: item.rackName || item.name || '',
      SITE: item.site || '',
      DC: item.dc || '',
      MAINTENANCE: item.maintenance?.toString() || "0",
      MAXPOWER: item.capacityKw?.toString() || "7",
      MAXU: "42", // Default value, could be updated if available
      FREEU: "10", // Default value, could be updated if available
      TOTAL_VOLTS: item.totalVolts?.toString() || null,
      TOTAL_AMPS: item.totalAmps?.toString() || null,
      TOTAL_WATTS: item.totalWatts?.toString() || null,
      TOTAL_KW: item.totalKw?.toString() || null,
      TOTAL_KWH: item.totalKwh?.toString() || null,
      TOTAL_VA: item.totalVa?.toString() || null,
      TOTAL_PF: item.totalPf?.toString() || null,
      L1_VOLTS: null, // These details are not in the new API
      L2_VOLTS: null,
      L3_VOLTS: null,
      L1_WATTS: null,
      L2_WATTS: null,
      L3_WATTS: null,
      L1_KW: null,
      L2_KW: null,
      L3_KW: null,
      L1_KWH: null,
      L2_KWH: null,
      L3_KWH: null,
      L1_PF: null,
      L2_PF: null,
      L3_PF: null,
      L1_VA: null,
      L2_VA: null,
      L3_VA: null,
      phase: item.phase || 'Single Phase' // Default to Single Phase if not specified
    }));
  } catch (error) {
    logger.error(`[${requestId}] Error transforming power data: ${error.message}`, error);
    // Return empty array in case of error to avoid crashing the application
    return [];
  }
};

/**
 * @route GET /api/racks
 * @desc Get all racks data
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
    logger.info(`[${requestId}] Fetching racks data`);
    
    try {
      // Get data from database with fallback to external API
      const data = await getDataWithFallback(
        getRacks,
        process.env.API1_URL,
        'racks',
        {
          retries: 3,
          retryDelay: 1000,
          useMockOnFail: false, // Don't use mock data on failure
          debug: true // Enable debugging for API calls
        }
      );

      // New API response is a direct array, not wrapped in data property
      if (data && Array.isArray(data) && !('status' in data)) {
        // This is likely the new API format - transform it
        logger.info(`[${requestId}] Detected new API format, transforming data`);
        const transformedData = transformPowerData(data, requestId);
        
        // Format response
        const response = {
          status: "Success",
          data: transformedData
        };
        
        // Calculate response time
        const responseTime = Date.now() - startTime;
        
        // Log for debug panel
        const debugLog = {
          id: requestId,
          timestamp: new Date().toISOString(),
          endpoint: '/api/racks',
          method: 'GET',
          status: 200,
          responseTime,
          responseBody: response
        };
        
        // Include debug information in response headers
        res.set('X-Debug-Id', requestId);
        res.set('X-Debug-Time', `${responseTime}ms`);
        
        if (req.headers['x-debug'] === 'true') {
          response.debug = debugLog;
        }
        
        return res.status(200).json(response);
      }
      
      // Log successful data retrieval and first item for debugging
      logger.info(`[${requestId}] Successfully retrieved ${data.length} racks`);
      if (data.length > 0) {
        logger.debug(`[${requestId}] First rack item sample:`, data[0]);
      }
      
      // Format response similar to original API
      const response = {
        status: "Success",
        data: data
      };
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Log for debug panel
      const debugLog = {
        id: requestId,
        timestamp: new Date().toISOString(),
        endpoint: '/api/racks',
        method: 'GET',
        status: 200,
        responseTime,
        responseBody: response
      };
      
      // Include debug information in response headers
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      if (req.headers['x-debug'] === 'true') {
        response.debug = debugLog;
      }
      
      res.status(200).json(response);
    } catch (error) {
      logger.error(`[${requestId}] Failed to retrieve racks data:`, error);
      
      // Log for debug panel
      const responseTime = Date.now() - startTime;
      const debugLog = {
        id: requestId,
        timestamp: new Date().toISOString(),
        endpoint: '/api/racks',
        method: 'GET',
        status: 500,
        responseTime,
        error: error.message
      };
      
      // Include debug information in response headers
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      return res.status(500).json({
        status: "Error",
        message: error.message,
        debug: debugLog
      });
    }
  } catch (error) {
    logger.error(`[${requestId}] Error in racks route:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: '/api/racks',
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

/**
 * @route GET /api/racks/:id
 * @desc Get a specific rack by ID
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
    logger.info(`[${requestId}] Fetching rack data for ID: ${id}`);
    
    // Implementation for specific rack data
    // This would need to be implemented with a specific SQL query
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: `/api/racks/${id}`,
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
    logger.error(`[${requestId}] Error fetching rack data for ID ${req.params.id}:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: `/api/racks/${req.params.id}`,
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