import express from 'express';
import { setupLogger } from '../utils/logger.js';
import { executeQuery } from '../config/db.js';
import { mockThresholdsData } from '../data/mockData.js';

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
  const demoMode = req.query.demo === 'true';
  
  // Apply CORS headers specifically for this route
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Debug, X-Request-ID");
  
  try {
    logger.info(`[${requestId}] Fetching thresholds. Demo mode: ${demoMode}`);
    
    if (demoMode) {
      logger.info(`[${requestId}] Using mock thresholds data (demo mode)`);
      const responseTime = Date.now() - startTime;
      
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      return res.status(200).json(mockThresholdsData);
    }
    
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
    
    const data = await executeQuery(query, [], { 
      queryId: requestId, 
      label: 'Get Thresholds' 
    });
    
    if (!data || data.length === 0) {
      // If no thresholds found, return default values
      logger.warn(`[${requestId}] No thresholds found in database, returning defaults`);
      
      const defaultThresholds = [{
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
      
      const response = {
        status: "Success",
        data: defaultThresholds
      };
      
      const responseTime = Date.now() - startTime;
      res.set('X-Debug-Id', requestId);
      res.set('X-Debug-Time', `${responseTime}ms`);
      
      return res.status(200).json(response);
    }
    
    logger.info(`[${requestId}] Successfully retrieved thresholds`);
    
    const response = {
      status: "Success",
      data: data
    };
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(200).json(response);
  } catch (error) {
    logger.error(`[${requestId}] Error fetching thresholds:`, error);
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: error.message
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
  
  try {
    const { 
      min_temp, 
      max_temp, 
      min_humidity, 
      max_humidity, 
      max_power_single_phase, 
      max_power_three_phase 
    } = req.body;
    
    logger.info(`[${requestId}] Updating thresholds`, {
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
    
    // Validate inputs
    if (min_temp === undefined || max_temp === undefined || 
        min_humidity === undefined || max_humidity === undefined || 
        max_power_single_phase === undefined || max_power_three_phase === undefined) {
      logger.warn(`[${requestId}] Missing required threshold values`);
      return res.status(400).json({
        status: "Error",
        message: "All threshold values are required"
      });
    }
    
    // Ensure min values are less than max values
    if (Number(min_temp) >= Number(max_temp)) {
      return res.status(400).json({
        status: "Error",
        message: "Minimum temperature must be less than maximum temperature"
      });
    }
    
    if (Number(min_humidity) >= Number(max_humidity)) {
      return res.status(400).json({
        status: "Error",
        message: "Minimum humidity must be less than maximum humidity"
      });
    }
    
    // First check if previous records exist
    const checkQuery = `
      SELECT COUNT(*) AS count 
      FROM thresholds 
      WHERE name = 'global'
    `;
    
    const checkResult = await executeQuery(checkQuery, [], { 
      queryId: `${requestId}_check`, 
      label: 'Check Thresholds Exist' 
    });
    
    // Create a new record regardless of whether one exists already
    // This creates a versioning system where we keep historical threshold values
    const query = `
      INSERT INTO thresholds 
        (name, min_temp, max_temp, min_humidity, max_humidity, max_power_single_phase, max_power_three_phase)
      VALUES
        ('global', @param0, @param1, @param2, @param3, @param4, @param5)
    `;
    
    await executeQuery(
      query, 
      [min_temp, max_temp, min_humidity, max_humidity, max_power_single_phase, max_power_three_phase], 
      { queryId: requestId, label: 'Create New Threshold Version' }
    );
    
    logger.info(`[${requestId}] Thresholds updated successfully - created new version`);
    
    const response = {
      status: "Success",
      message: "Thresholds updated successfully"
    };
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(200).json(response);
  } catch (error) {
    logger.error(`[${requestId}] Error updating thresholds:`, error);
    
    const responseTime = Date.now() - startTime;
    res.set('X-Debug-Id', requestId);
    res.set('X-Debug-Time', `${responseTime}ms`);
    
    res.status(500).json({
      status: "Error",
      message: error.message
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