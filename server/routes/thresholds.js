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
    
    // First try using the fast SP directly
    let data;
    try {
      logger.info(`[${requestId}] Attempting to fetch thresholds using fast stored procedure`, {
        requestId
      });
      
      const fastStartTime = Date.now();
      data = await executeQuery("EXEC sp_get_thresholds_fast", [], {
        queryId: `${requestId}_fast_sp`,
        label: 'Get Thresholds Fast SP',
        timeout: 3000 // Very short timeout
      });
      
      const fastDuration = Date.now() - fastStartTime;
      logger.info(`[${requestId}] Fast SP executed in ${fastDuration}ms`, {
        requestId,
        duration: fastDuration,
        success: !!data && data.length > 0,
        resultCount: data ? data.length : 0
      });
      
      if (data && data.length > 0) {
        logger.info(`[${requestId}] Successfully retrieved thresholds using fast SP`, {
          requestId
        });
        
        const response = {
          status: "Success",
          data: data
        };
        
        const responseTime = Date.now() - startTime;
        res.set('X-Debug-Id', requestId);
        res.set('X-Debug-Time', `${responseTime}ms`);
        
        logger.info(`[${requestId}] Sending thresholds response (fast path), total time: ${responseTime}ms`, {
          requestId,
          responseTime
        });
        
        return res.status(200).json(response);
      }
    } catch (fastSpError) {
      logger.warn(`[${requestId}] Fast SP failed: ${fastSpError.message}, trying fallback methods`, {
        requestId,
        error: fastSpError.message
      });
    }
    
    // Try using the view directly
    try {
      logger.info(`[${requestId}] Attempting to fetch thresholds using view`, {
        requestId
      });
      
      const viewStartTime = Date.now();
      data = await executeQuery(
        "SELECT * FROM vw_current_thresholds WHERE name = 'global'", 
        [], 
        { 
          queryId: `${requestId}_view`, 
          label: 'Get Thresholds (View)',
          timeout: 3000 // Very short timeout for view
        }
      );
      
      const viewDuration = Date.now() - viewStartTime;
      logger.info(`[${requestId}] View query executed in ${viewDuration}ms`, {
        requestId,
        duration: viewDuration,
        success: !!data && data.length > 0,
        resultCount: data ? data.length : 0
      });
      
      if (data && data.length > 0) {
        logger.info(`[${requestId}] Successfully retrieved thresholds using view`, {
          requestId
        });
        
        const response = {
          status: "Success",
          data: data
        };
        
        const responseTime = Date.now() - startTime;
        res.set('X-Debug-Id', requestId);
        res.set('X-Debug-Time', `${responseTime}ms`);
        
        logger.info(`[${requestId}] Sending thresholds response (view path), total time: ${responseTime}ms`, {
          requestId,
          responseTime
        });
        
        return res.status(200).json(response);
      } else {
        logger.warn(`[${requestId}] View returned no thresholds, trying regular stored procedure`, {
          requestId
        });
      }
    } catch (viewError) {
      logger.warn(`[${requestId}] View query failed: ${viewError.message}, trying standard SP`, {
        requestId,
        error: viewError.message
      });
    }
    
    // Try using the regular SP
    try {
      logger.info(`[${requestId}] Attempting to fetch thresholds using standard stored procedure`, {
        requestId
      });
      
      const spStartTime = Date.now();
      data = await executeQuery("EXEC sp_get_thresholds", [], {
        queryId: `${requestId}_standard_sp`,
        label: 'Get Thresholds Standard SP',
        timeout: 3000 // Short timeout for SP
      });
      
      const spDuration = Date.now() - spStartTime;
      logger.info(`[${requestId}] Standard SP executed in ${spDuration}ms`, {
        requestId,
        duration: spDuration,
        success: !!data && data.length > 0,
        resultCount: data ? data.length : 0
      });
      
      if (data && data.length > 0) {
        logger.info(`[${requestId}] Successfully retrieved thresholds using standard SP`, {
          requestId
        });
      } else {
        logger.warn(`[${requestId}] Standard SP returned no thresholds, trying direct query`, {
          requestId
        });
      }
    } catch (spError) {
      logger.warn(`[${requestId}] Standard SP failed: ${spError.message}, trying direct query`, {
        requestId,
        error: spError.message
      });
    }
    
    // If still no data, try direct query as last resort
    if (!data || data.length === 0) {
      logger.info(`[${requestId}] Trying direct query as last resort`, {
        requestId
      });
      
      const query = `
        SELECT TOP 1
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
        FROM thresholds WITH (NOLOCK)
        WHERE name = 'global'
        ORDER BY created_at DESC
      `;
      
      const directStartTime = Date.now();
      try {
        data = await executeQuery(query, [], { 
          queryId: `${requestId}_direct`, 
          label: 'Get Thresholds Direct Query',
          timeout: 3000 // Short timeout
        });
        
        const directDuration = Date.now() - directStartTime;
        logger.info(`[${requestId}] Direct query executed in ${directDuration}ms`, {
          requestId,
          duration: directDuration,
          success: !!data && data.length > 0,
          resultCount: data ? data.length : 0
        });
      } catch (directError) {
        logger.error(`[${requestId}] Direct query also failed: ${directError.message}`, {
          requestId,
          error: directError.message,
          stack: directError.stack
        });
        throw directError;
      }
    }
    
    // If still no data, return default values
    if (!data || data.length === 0) {
      logger.warn(`[${requestId}] All database attempts failed, returning default thresholds`, {
        requestId
      });
      
      data = [{
        id: "default-threshold-id",
        name: "global",
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
    
    // Try using the stored procedure first for better performance
    try {
      logger.info(`[${requestId}] Attempting to update thresholds using stored procedure`, {
        requestId
      });
      
      const spStartTime = Date.now();
      await executeQuery(
        "EXEC sp_update_thresholds @param0, @param1, @param2, @param3, @param4, @param5", 
        [min_temp, max_temp, min_humidity, max_humidity, max_power_single_phase, max_power_three_phase], 
        { 
          queryId: requestId, 
          label: 'Update Thresholds SP',
          timeout: 3000 // Short timeout
        }
      );
      
      const spDuration = Date.now() - spStartTime;
      logger.info(`[${requestId}] Thresholds updated successfully via SP in ${spDuration}ms`, {
        requestId,
        duration: spDuration
      });
      
      const response = {
        status: "Success",
        message: "Thresholds updated successfully"
      };
      
      const responseTime = Date.now() - startTime;
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      return res.status(200).json(response);
    } catch (spError) {
      logger.warn(`[${requestId}] Stored procedure update failed: ${spError.message}, trying direct query`, {
        requestId,
        error: spError.message
      });
    }
    
    // Fall back to direct query if SP fails
    // Always create a new record for versioning
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
      params
    });
    
    const directStartTime = Date.now();
    await executeQuery(query, params, { 
      queryId: requestId, 
      label: 'Create New Threshold Version',
      timeout: 3000 // Shorter timeout for insert
    });
    
    const directDuration = Date.now() - directStartTime;
    logger.info(`[${requestId}] Thresholds update successful via direct query in ${directDuration}ms`, {
      requestId,
      duration: directDuration
    });
    
    // Run the cleanup procedure to remove old threshold records
    try {
      logger.info(`[${requestId}] Running cleanup procedure to remove old threshold versions`, {
        requestId
      });
      
      await executeQuery("EXEC sp_purge_old_thresholds 10", [], {
        queryId: `${requestId}_cleanup`,
        label: 'Cleanup Old Thresholds',
        timeout: 2000 // Very short timeout
      });
      
      logger.info(`[${requestId}] Old threshold versions cleaned up`, {
        requestId
      });
    } catch (cleanupError) {
      // Non-fatal error, just log it
      logger.warn(`[${requestId}] Threshold cleanup failed: ${cleanupError.message}`, {
        requestId,
        error: cleanupError.message
      });
    }
    
    const response = {
      status: "Success",
      message: "Thresholds updated successfully"
    };
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    logger.info(`[${requestId}] Sending successful threshold update response, total time: ${responseTime}ms`, {
      requestId,
      responseTime
    });
    
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