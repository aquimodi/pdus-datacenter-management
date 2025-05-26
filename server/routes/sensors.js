import express from 'express';
import { getSensorReadings } from '../config/db.js';
import { setupLogger } from '../utils/logger.js';
import { getDataWithFallback } from '../utils/api.js';

const router = express.Router();
const logger = setupLogger();

/**
 * Transform the new sensor API data to our internal format
 * @param {Array} sensorData - Data from sensor API
 * @returns {Array} Transformed sensor data
 */
const transformNewSensorData = (sensorData, requestId) => {
  logger.info(`[${requestId}] Transforming sensor data with ${sensorData.length} items using new API format`);
  
  try {
    return sensorData.map(item => ({
      id: item.id?.toString() || '',
      nodeId: item.nodeId?.toString() || '',
      sensorIndex: item.sensorIndex?.toString() || '',
      sensorType: item.sensorType || '',
      rackId: item.rackId?.toString() || '',
      RACK_NAME: item.rackName || item.name || '',
      SITE: item.site || '',
      DC: item.dc || '',
      TEMPERATURE: item.temperature?.toString() || '',
      HUMIDITY: item.humidity?.toString() || '',
      lastUpdate: item.lastUpdate || '',
      status: item.status || ''
    }));
  } catch (error) {
    logger.error(`[${requestId}] Error transforming sensor data: ${error.message}`, error);
    return []; // Return empty array on error
  }
};

/**
 * Transform raw sensor data into a standardized format
 * @param {Array|Object} rawData - The raw data from API or database
 * @returns {Array} Standardized sensor data array
 */
const transformSensorData = (rawData, requestId) => {
  // If already array, check if it's in the expected format
  if (Array.isArray(rawData)) {
    // Check first item to see if it has the structure of the new API format
    if (rawData.length > 0 && 
        rawData[0].hasOwnProperty('temperature') && 
        rawData[0].hasOwnProperty('humidity') && 
        typeof rawData[0].temperature === 'number') {
      // This appears to be the new API format
      logger.debug(`[${requestId}] Detected new sensor API format`);
      return transformNewSensorData(rawData, requestId);
    }
    
    // Check if it's in our current expected format
    if (rawData.length > 0 && rawData[0].RACK_NAME) {
      logger.debug(`[${requestId}] Sensor data already in correct format`);
      return rawData;
    }
    
    // If it doesn't, try to transform each item
    logger.debug(`[${requestId}] Transforming sensor data array with ${rawData.length} items`);
    return rawData.map(item => {
      return {
        RACK_NAME: item.NAME || item.name || item.rack_name || item.rackName || 'Unknown',
        TEMPERATURE: item.TEMPERATURE || (item.temperature !== undefined ? item.temperature.toString() : null),
        HUMIDITY: item.HUMIDITY || (item.humidity !== undefined ? item.humidity.toString() : null),
        SITE: item.SITE || item.site || 'Unknown',
        DC: item.DC || item.dc || item.datacenter || 'Unknown'
      };
    });
  }
  
  // If object with nested data, try to extract
  if (rawData && typeof rawData === 'object') {
    if (rawData.sensors && Array.isArray(rawData.sensors)) {
      logger.debug(`[${requestId}] Extracting sensor data from 'sensors' property`);
      return transformSensorData(rawData.sensors, requestId);
    }
    if (rawData.readings && Array.isArray(rawData.readings)) {
      logger.debug(`[${requestId}] Extracting sensor data from 'readings' property`);
      return transformSensorData(rawData.readings, requestId);
    }
    if (rawData.results && Array.isArray(rawData.results)) {
      logger.debug(`[${requestId}] Extracting sensor data from 'results' property`);
      return transformSensorData(rawData.results, requestId);
    }
    if (rawData.data && Array.isArray(rawData.data)) {
      logger.debug(`[${requestId}] Extracting sensor data from 'data' property`);
      return transformSensorData(rawData.data, requestId);
    }
  }
  
  // If nothing worked, log error and return empty array
  logger.error(`[${requestId}] Could not transform sensor data, invalid format:`, 
    typeof rawData === 'object' ? Object.keys(rawData) : typeof rawData);
  return [];
};

/**
 * @route GET /api/sensors
 * @desc Get all sensor readings
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
    logger.info(`[${requestId}] Fetching sensor readings`);
    
    try {
      // Get data from database with fallback to external API
      let rawData = await getDataWithFallback(
        getSensorReadings,
        process.env.API2_URL,
        'sensor readings',
        {
          retries: 3,
          retryDelay: 1000,
          useMockOnFail: false, // Don't use mock data
          debug: true // Enable debugging for API calls
        }
      );
      
      // Check if we got the new API format (direct array)
      if (rawData && Array.isArray(rawData) && rawData.length > 0 && 
          rawData[0].hasOwnProperty('temperature') && typeof rawData[0].temperature === 'number') {
        // Transform data from the new API format
        const data = transformNewSensorData(rawData, requestId);
        logger.info(`[${requestId}] Processed data from new sensor API format`);
        
        // Format response
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
          endpoint: '/api/sensors',
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
      } else {
        // Transform the data to ensure consistent format with legacy API
        const data = transformSensorData(rawData, requestId);
        
        // Log the transformation results
        logger.info(`[${requestId}] Transformed sensor data, got ${data.length} readings`);
        if (data.length > 0) {
          logger.debug(`[${requestId}] First sensor data item:`, data[0]);
        }
        
        // If no data was returned or transformation failed, return empty array
        if (!data || data.length === 0) {
          logger.warn(`[${requestId}] No sensor data after transformation, returning empty array`);
          
          // Format response with empty array
          const response = {
            status: "Success",
            data: []
          };
          
          // Calculate response time
          const responseTime = Date.now() - startTime;
          
          // Log for debug panel
          const debugLog = {
            id: requestId,
            timestamp: new Date().toISOString(),
            endpoint: '/api/sensors',
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
        
        // Format response
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
          endpoint: '/api/sensors',
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
    } catch (error) {
      logger.error(`[${requestId}] Failed to retrieve sensor data:`, error);
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Log for debug panel
      const debugLog = {
        id: requestId,
        timestamp: new Date().toISOString(),
        endpoint: '/api/sensors',
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
    logger.error(`[${requestId}] Error in sensors route:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: '/api/sensors',
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
 * @route GET /api/sensors/rack/:rackId
 * @desc Get sensor readings for a specific rack
 * @access Public
 */
router.get('/rack/:rackId', async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Apply CORS headers specifically for this route
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  
  try {
    const { rackId } = req.params;
    logger.info(`[${requestId}] Fetching sensor readings for rack ID: ${rackId}`);
    
    // Implementation for specific rack sensors
    // This would need to be implemented with a specific SQL query
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: `/api/sensors/rack/${rackId}`,
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
    logger.error(`[${requestId}] Error fetching sensor readings for rack ID ${req.params.rackId}:`, error);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log for debug panel
    const debugLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: `/api/sensors/rack/${req.params.rackId}`,
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