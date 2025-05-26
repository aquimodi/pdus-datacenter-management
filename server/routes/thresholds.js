import express from 'express';
import { setupLogger } from '../utils/logger.js';
import { executeQuery, getThresholds, updateThresholds } from '../config/db.js';

const router = express.Router();
const logger = setupLogger();

/**
 * @route GET /api/thresholds
 * @desc Get all threshold settings
 * @access Public
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Apply CORS headers specifically for this route
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  
  logger.info(`[${requestId}] Threshold request received - starting processing`, {
    requestId,
    method: 'GET',
    endpoint: '/api/thresholds'
  });
  
  try {
    logger.info(`[${requestId}] Fetching thresholds from database`, {
      requestId
    });
    
    // First try using the getThresholds function from db.js
    let data;
    try {
      logger.info(`[${requestId}] Attempting to fetch thresholds using getThresholds function`, {
        requestId
      });
      
      const startQueryTime = Date.now();
      data = await getThresholds();
      const queryDuration = Date.now() - startQueryTime;
      
      logger.info(`[${requestId}] getThresholds executed in ${queryDuration}ms`, {
        requestId,
        duration: queryDuration,
        success: !!data && data.length > 0,
        resultCount: data ? data.length : 0
      });
    } catch (functionError) {
      logger.error(`[${requestId}] Error using getThresholds function: ${functionError.message}`, {
        requestId,
        error: functionError.message,
        stack: functionError.stack
      });
      
      // Fall back to direct query with a shorter timeout
      logger.info(`[${requestId}] Falling back to direct query with shorter timeout`, {
        requestId
      });
      
      const query = `
        SELECT
          id,
          name,
          min_temp,
          max_temp,
          min_humidity,
          max_humidity,
          max_power_single_phase,
          max_power_three_phase,
          created_at,
          updated_at
        FROM thresholds
        WHERE name = 'global'
        ORDER BY updated_at DESC
      `;
      
      const startDirectQueryTime = Date.now();
      try {
        data = await executeQuery(query, [], { 
          queryId: requestId, 
          label: 'Get Thresholds Direct', 
          timeout: 5000 // Reduced timeout
        });
        
        const directQueryDuration = Date.now() - startDirectQueryTime;
        logger.info(`[${requestId}] Direct query executed in ${directQueryDuration}ms`, {
          requestId,
          duration: directQueryDuration,
          success: !!data && data.length > 0,
          resultCount: data ? data.length : 0
        });
      } catch (directQueryError) {
        logger.error(`[${requestId}] Direct query also failed: ${directQueryError.message}`, {
          requestId,
          error: directQueryError.message,
          stack: directQueryError.stack
        });
        throw directQueryError;
      }
    }
    
    // If no data, try with stored procedure
    if (!data || data.length === 0) {
      logger.info(`[${requestId}] No thresholds found, trying stored procedure`, {
        requestId
      });
      
      try {
        const spStartTime = Date.now();
        data = await executeQuery("EXEC sp_get_thresholds", [], {
          queryId: requestId,
          label: 'Get Thresholds SP',
          timeout: 5000 // Reduced timeout
        });
        
        const spDuration = Date.now() - spStartTime;
        logger.info(`[${requestId}] Stored procedure executed in ${spDuration}ms`, {
          requestId,
          duration: spDuration,
          success: !!data && data.length > 0,
          resultCount: data ? data.length : 0
        });
      } catch (spError) {
        logger.error(`[${requestId}] Stored procedure failed: ${spError.message}`, {
          requestId,
          error: spError.message,
          stack: spError.stack
        });
        
        // Don't throw, continue with default values
      }
    }
    
    // If still no data, return default values
    if (!data || data.length === 0) {
      logger.warn(`[${requestId}] No thresholds found, returning defaults`, {
        requestId
      });
      
      data = [{
        id: null,
        name: 'global',
        min_temp: 18.0,
        max_temp: 32.0,
        min_humidity: 40.0,
        max_humidity: 70.0,
        max_power_single_phase: 16.0,
        max_power_three_phase: 48.0,
        created_at: new Date(),
        updated_at: new Date()
      }];
    }
    
    logger.info(`[${requestId}] Successfully prepared threshold response`, {
      requestId,
      thresholdCount: data.length
    });
    
    const response = {
      status: "Success",
      data: data
    };
    
    const responseTime = Date.now() - startTime;
    logger.info(`[${requestId}] Sending thresholds response, total time: ${responseTime}ms`, {
      requestId,
      responseTime
    });
    
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    return res.status(200).json(response);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error(`[${requestId}] Error fetching thresholds: ${error.message}`, {
      requestId,
      responseTime,
      error: error.message,
      stack: error.stack
    });
    
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: `Error retrieving thresholds: ${error.message}`
    });
  }
});

/**
 * @route PUT /api/thresholds
 * @desc Update threshold settings
 * @access Public
 */
router.put('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Apply CORS headers specifically for this route
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  
  logger.info(`[${requestId}] Threshold update request received`, {
    requestId,
    method: 'PUT',
    endpoint: '/api/thresholds',
    body: req.body
  });
  
  try {
    const { 
      min_temp, 
      max_temp, 
      min_humidity, 
      max_humidity, 
      max_power_single_phase, 
      max_power_three_phase 
    } = req.body;
    
    // Validate inputs
    if (min_temp === undefined || max_temp === undefined || 
        min_humidity === undefined || max_humidity === undefined || 
        max_power_single_phase === undefined || max_power_three_phase === undefined) {
      logger.warn(`[${requestId}] Missing required threshold values`, {
        requestId,
        body: req.body
      });
      
      return res.status(400).json({
        status: "Error",
        message: "All threshold values are required"
      });
    }
    
    // Ensure min values are less than max values
    if (Number(min_temp) >= Number(max_temp)) {
      logger.warn(`[${requestId}] Invalid temperature thresholds: min >= max`, {
        requestId,
        min_temp,
        max_temp
      });
      
      return res.status(400).json({
        status: "Error",
        message: "Minimum temperature must be less than maximum temperature"
      });
    }
    
    if (Number(min_humidity) >= Number(max_humidity)) {
      logger.warn(`[${requestId}] Invalid humidity thresholds: min >= max`, {
        requestId,
        min_humidity,
        max_humidity
      });
      
      return res.status(400).json({
        status: "Error",
        message: "Minimum humidity must be less than maximum humidity"
      });
    }
    
    logger.info(`[${requestId}] Validated thresholds, proceeding with update`, {
      requestId,
      thresholds: { 
        min_temp, 
        max_temp, 
        min_humidity, 
        max_humidity, 
        max_power_single_phase, 
        max_power_three_phase 
      }
    });
    
    // Try using updateThresholds function first
    try {
      const updateResult = await updateThresholds({
        min_temp, 
        max_temp, 
        min_humidity, 
        max_humidity, 
        max_power_single_phase, 
        max_power_three_phase
      });
      
      logger.info(`[${requestId}] Thresholds updated successfully using updateThresholds function`, {
        requestId,
        result: updateResult
      });
    } catch (updateError) {
      logger.error(`[${requestId}] updateThresholds function failed: ${updateError.message}. Trying direct query.`, {
        requestId,
        error: updateError.message,
        stack: updateError.stack
      });
      
      // First check if previous records exist
      logger.info(`[${requestId}] Checking if threshold record exists`, {
        requestId
      });
      
      const checkQuery = `
        SELECT COUNT(*) AS count 
        FROM thresholds 
        WHERE name = 'global'
      `;
      
      const checkResult = await executeQuery(checkQuery, [], { 
        queryId: `${requestId}_check`, 
        label: 'Check Thresholds Exist',
        timeout: 5000 // Shorter timeout
      });
      
      const exists = checkResult && checkResult.length > 0 && checkResult[0].count > 0;
      logger.info(`[${requestId}] Threshold record exists: ${exists}`, {
        requestId,
        exists
      });
      
      // Always insert a new record for versioning
      const query = `
        INSERT INTO thresholds 
          (name, min_temp, max_temp, min_humidity, max_humidity, max_power_single_phase, max_power_three_phase)
        VALUES
          ('global', @param0, @param1, @param2, @param3, @param4, @param5)
      `;
      
      const params = [
        min_temp,
        max_temp,
        min_humidity,
        max_humidity,
        max_power_single_phase,
        max_power_three_phase
      ];
      
      logger.info(`[${requestId}] Executing direct insert query for thresholds`, {
        requestId,
        query,
        params
      });
      
      await executeQuery(query, params, { 
        queryId: requestId, 
        label: 'Create New Threshold Version',
        timeout: 5000 // Shorter timeout
      });
      
      logger.info(`[${requestId}] Direct insert query completed successfully`, {
        requestId
      });
    }
    
    logger.info(`[${requestId}] Thresholds update successful`, {
      requestId
    });
    
    const response = {
      status: "Success",
      message: "Thresholds updated successfully"
    };
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(200).json(response);
  } catch (error) {
    logger.error(`[${requestId}] Error updating thresholds: ${error.message}`, {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: `Error updating thresholds: ${error.message}`
    });
  }
});

// Explicit OPTIONS handler for this route
router.options('/', (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  res.status(200).send();
});

export default router;