import { fetchExternalAPI, isApiReachable } from '../utils/api.js';
import { executeQuery, dbEnabled } from '../config/db.js';
import { setupLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = setupLogger();
let monitoringActive = false;
let monitoringInterval = null;
let lastRunTimestamp = null;
let lastRunDuration = null;
let api1Reachable = false;
let api2Reachable = false;

// Tracking stats
let cyclesCompleted = 0;
let problemsDetected = 0;
let racksStored = 0;
let sensorReadingsStored = 0;

// Default interval is 5 minutes (300000 ms)
const DEFAULT_INTERVAL = 300000;

/**
 * Start the background monitoring service
 * @param {number} interval - Polling interval in milliseconds
 */
export const startMonitoring = (interval = DEFAULT_INTERVAL) => {
  if (monitoringActive) {
    logger.warn('Monitoring service is already running');
    return;
  }

  logger.info(`Starting monitoring service with interval of ${interval}ms`);
  monitoringActive = true;

  // Initial run immediately
  runMonitoringCycle();

  // Set up recurring interval
  monitoringInterval = setInterval(runMonitoringCycle, interval);
};

/**
 * Stop the background monitoring service
 */
export const stopMonitoring = () => {
  if (!monitoringActive) {
    logger.warn('Monitoring service is not running');
    return;
  }

  logger.info('Stopping monitoring service');
  clearInterval(monitoringInterval);
  monitoringInterval = null;
  monitoringActive = false;
};

/**
 * Get the current status of the monitoring service
 * @returns {Object} The monitoring service status
 */
export const getMonitoringStatus = () => {
  return {
    active: monitoringActive,
    interval: monitoringActive ? monitoringInterval?._idleTimeout : null,
    lastRun: lastRunTimestamp,
    lastRunTime: lastRunDuration,
    api1Reachable,
    api2Reachable,
    cyclesCompleted,
    problemsDetected,
    racksStored,
    sensorReadingsStored
  };
};

/**
 * Run a complete monitoring cycle:
 * 1. Fetch data from APIs
 * 2. Store in database
 * 3. Check for threshold violations
 * 4. Create problem records for violations
 */
export async function runMonitoringCycle() {
  const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const startTime = Date.now();
  lastRunTimestamp = new Date();
  
  logger.info(`Starting monitoring cycle [${cycleId}]`);
  
  try {
    // 1. Check API availability first
    [api1Reachable, api2Reachable] = await Promise.all([
      isApiReachable(process.env.API1_URL),
      isApiReachable(process.env.API2_URL)
    ]);
    
    logger.info(`API reachability check: API1=${api1Reachable}, API2=${api2Reachable} [${cycleId}]`);
    
    // Skip further processing if both APIs are unreachable
    if (!api1Reachable && !api2Reachable) {
      logger.error(`Both APIs are unreachable, skipping monitoring cycle [${cycleId}]`);
      lastRunDuration = Date.now() - startTime;
      return;
    }

    // 2. Check if database is enabled
    if (!dbEnabled) {
      logger.error(`Database is disabled, skipping monitoring cycle [${cycleId}]`);
      lastRunDuration = Date.now() - startTime;
      return;
    }
    
    // 3. Fetch data from external APIs
    logger.info(`Fetching data from external APIs [${cycleId}]`);

    // Fetch from API1 (racks)
    let rackData = [];
    if (api1Reachable) {
      try {
        const api1Response = await fetchExternalAPI(process.env.API1_URL, 'racks', {
          retries: 2,
          retryDelay: 1000,
          debug: true
        });
        
        if (Array.isArray(api1Response)) {
          // New API format (direct array)
          rackData = api1Response;
          logger.info(`Retrieved ${rackData.length} racks from API1 (new format) [${cycleId}]`);
        } else if (api1Response && api1Response.status === "Success" && Array.isArray(api1Response.data)) {
          // Old API format (wrapped in status/data)
          rackData = api1Response.data;
          logger.info(`Retrieved ${rackData.length} racks from API1 (old format) [${cycleId}]`);
        } else {
          logger.error(`Unexpected response format from API1 [${cycleId}]`);
        }
      } catch (api1Error) {
        logger.error(`Error fetching data from API1: ${api1Error.message} [${cycleId}]`);
      }
    }

    // Fetch from API2 (sensors)
    let sensorData = [];
    if (api2Reachable) {
      try {
        const api2Response = await fetchExternalAPI(process.env.API2_URL, 'sensors', {
          retries: 2,
          retryDelay: 1000,
          debug: true
        });
        
        if (Array.isArray(api2Response)) {
          // New API format (direct array)
          sensorData = api2Response;
          logger.info(`Retrieved ${sensorData.length} sensor readings from API2 (new format) [${cycleId}]`);
        } else if (api2Response && api2Response.status === "Success" && Array.isArray(api2Response.data)) {
          // Old API format (wrapped in status/data)
          sensorData = api2Response.data;
          logger.info(`Retrieved ${sensorData.length} sensor readings from API2 (old format) [${cycleId}]`);
        } else {
          logger.error(`Unexpected response format from API2 [${cycleId}]`);
        }
      } catch (api2Error) {
        logger.error(`Error fetching data from API2: ${api2Error.message} [${cycleId}]`);
      }
    }

    // 4. Retrieve current threshold settings from the database
    logger.info(`Retrieving threshold settings [${cycleId}]`);
    let thresholds = await getThresholds();
    
    // 5. Store rack data in database (upsert)
    if (rackData.length > 0) {
      await storeRackData(rackData, cycleId);
    }
    
    // 6. Store sensor data in database
    if (sensorData.length > 0) {
      await storeSensorData(sensorData, cycleId);
    }
    
    // 7. Check for threshold violations and create problems
    if (sensorData.length > 0 && thresholds) {
      await checkThresholdViolations(sensorData, rackData, thresholds, cycleId);
    }

    // Increment completed cycles counter
    cyclesCompleted++;
    
    lastRunDuration = Date.now() - startTime;
    logger.info(`Monitoring cycle completed in ${lastRunDuration}ms [${cycleId}]`);
  } catch (error) {
    logger.error(`Error in monitoring cycle: ${error.message} [${cycleId}]`, {
      cycleId,
      error: error.message,
      stack: error.stack
    });
    lastRunDuration = Date.now() - startTime;
  }
}

/**
 * Get current threshold settings from database
 * @returns {Object} Threshold settings
 */
async function getThresholds() {
  try {
    // Try calling the stored procedure first
    try {
      const result = await executeQuery("EXEC sp_get_thresholds", [], { 
        queryId: `getThresholds_${Date.now()}`, 
        label: 'Get Thresholds (SP)' 
      });
      
      if (result && result.length > 0) {
        logger.info(`Successfully retrieved thresholds using stored procedure`);
        return result[0]; // Return the first threshold record
      }
    } catch (spError) {
      logger.warn(`Failed to fetch thresholds using stored procedure: ${spError.message}. Falling back to direct query.`);
    }
    
    // Fall back to direct query if stored procedure fails
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
    
    const result = await executeQuery(query, [], { 
      queryId: `getThresholds_${Date.now()}`, 
      label: 'Get Thresholds (Direct Query)' 
    });
    
    if (result.length === 0) {
      logger.warn(`No threshold values found in database, using defaults`);
      return {
        id: "default-threshold",
        name: "global",
        min_temp: 18.0,
        max_temp: 32.0,
        min_humidity: 40.0,
        max_humidity: 70.0,
        max_power_single_phase: 16.0,
        max_power_three_phase: 48.0,
        created_at: new Date(),
        updated_at: new Date()
      };
    }
    
    logger.info(`Successfully retrieved threshold settings from database`);
    return result[0]; // Return the first threshold record
  } catch (error) {
    logger.error(`Failed to fetch thresholds: ${error.message}`);
    
    // Return default thresholds in case of error
    return {
      id: "default-threshold",
      name: "global",
      min_temp: 18.0,
      max_temp: 32.0,
      min_humidity: 40.0,
      max_humidity: 70.0,
      max_power_single_phase: 16.0,
      max_power_three_phase: 48.0,
      created_at: new Date(),
      updated_at: new Date()
    };
  }
}

/**
 * Store rack data in the database
 * @param {Array} rackData - Array of rack objects from API
 * @param {string} cycleId - Current monitoring cycle ID for logging
 */
async function storeRackData(rackData, cycleId) {
  try {
    logger.info(`Storing ${rackData.length} racks in database [${cycleId}]`);
    
    // Process each rack individually for better error handling
    let successCount = 0;
    let errorCount = 0;
    let updateCount = 0;
    let insertCount = 0;
    
    for (const rack of rackData) {
      try {
        // Transform API data to database schema
        // First, check if rack exists using the provided name
        const checkQuery = `
          SELECT id FROM racks 
          WHERE name = @param0
        `;
        
        const existingRacks = await executeQuery(checkQuery, [rack.NAME || rack.name], {
          queryId: `checkRack_${Date.now()}`,
          label: 'Check Rack Exists'
        });
        
        if (existingRacks && existingRacks.length > 0) {
          // Update existing rack
          const updateQuery = `
            UPDATE racks
            SET 
              site = @param1,
              datacenter = @param2,
              maintenance = @param3,
              max_power = @param4,
              phase = @param5,
              updated_at = GETDATE()
            WHERE id = @param6
          `;
          
          await executeQuery(updateQuery, [
            rack.SITE || rack.site,
            rack.DC || rack.datacenter || rack.dc,
            rack.MAINTENANCE === '1' || rack.maintenance === 1 || rack.MAINTENANCE === true || rack.maintenance === true ? 1 : 0,
            rack.MAXPOWER || rack.max_power || rack.capacityKw || '7',
            rack.phase || ((rack.L2_VOLTS === null && rack.L3_VOLTS === null) ? 'Single Phase' : '3-Phase'),
            existingRacks[0].id
          ], {
            queryId: `updateRack_${Date.now()}`,
            label: 'Update Rack'
          });
          
          logger.debug(`Updated rack ${rack.NAME || rack.name} in database [${cycleId}]`);
          updateCount++;
          successCount++;
        } else {
          // Insert new rack
          const insertQuery = `
            INSERT INTO racks (
              name, site, datacenter, maintenance, max_power, max_units, free_units, phase
            )
            VALUES (
              @param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7
            )
          `;
          
          await executeQuery(insertQuery, [
            rack.NAME || rack.name,
            rack.SITE || rack.site,
            rack.DC || rack.datacenter || rack.dc,
            rack.MAINTENANCE === '1' || rack.maintenance === 1 || rack.MAINTENANCE === true || rack.maintenance === true ? 1 : 0,
            rack.MAXPOWER || rack.max_power || rack.capacityKw || '7',
            rack.MAXU || rack.max_units || '42',
            rack.FREEU || rack.free_units || '10',
            rack.phase || ((rack.L2_VOLTS === null && rack.L3_VOLTS === null) ? 'Single Phase' : '3-Phase')
          ], {
            queryId: `insertRack_${Date.now()}`,
            label: 'Insert Rack'
          });
          
          logger.info(`Inserted new rack ${rack.NAME || rack.name} into database [${cycleId}]`);
          insertCount++;
          successCount++;
        }
      } catch (rackError) {
        logger.error(`Error storing rack ${rack.NAME || rack.name}: ${rackError.message} [${cycleId}]`, {
          error: rackError.message,
          stack: rackError.stack,
          rack: rack.NAME || rack.name
        });
        errorCount++;
      }
    }
    
    // Update global counter
    racksStored += successCount;
    
    logger.info(`Rack storage complete: ${successCount} successful (${updateCount} updated, ${insertCount} inserted), ${errorCount} failed [${cycleId}]`);
  } catch (error) {
    logger.error(`Error storing rack data: ${error.message} [${cycleId}]`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Store sensor data in the database
 * @param {Array} sensorData - Array of sensor reading objects from API
 * @param {string} cycleId - Current monitoring cycle ID for logging
 */
async function storeSensorData(sensorData, cycleId) {
  try {
    logger.info(`Storing ${sensorData.length} sensor readings in database [${cycleId}]`);
    
    // Process each sensor reading individually for better error handling
    let successCount = 0;
    let errorCount = 0;
    let noRackCount = 0;
    
    for (const sensor of sensorData) {
      try {
        // First, get the rack_id based on rack name
        const rackName = sensor.RACK_NAME || sensor.rackName || sensor.name;
        
        if (!rackName) {
          logger.warn(`Sensor reading has no rack name, skipping [${cycleId}]`);
          noRackCount++;
          continue;
        }
        
        const rackQuery = `
          SELECT id FROM racks 
          WHERE name = @param0
        `;
        
        const racks = await executeQuery(rackQuery, [rackName], {
          queryId: `getRackId_${Date.now()}`,
          label: 'Get Rack ID for Sensor'
        });
        
        if (!racks || racks.length === 0) {
          logger.warn(`No rack found with name ${rackName}, skipping sensor reading [${cycleId}]`);
          noRackCount++;
          continue;
        }
        
        const rackId = racks[0].id;
        
        // Insert the sensor reading
        const insertQuery = `
          INSERT INTO sensor_readings (
            rack_id, temperature, humidity, total_power, total_current, total_voltage
          )
          VALUES (
            @param0, @param1, @param2, @param3, @param4, @param5
          )
        `;
        
        const temperature = sensor.TEMPERATURE || sensor.temperature || null;
        const humidity = sensor.HUMIDITY || sensor.humidity || null;
        const totalPower = sensor.TOTAL_KW || sensor.totalKw || null;
        const totalCurrent = sensor.TOTAL_AMPS || sensor.totalAmps || null;
        const totalVoltage = sensor.TOTAL_VOLTS || sensor.totalVolts || null;
        
        await executeQuery(insertQuery, [
          rackId,
          temperature,
          humidity,
          totalPower,
          totalCurrent,
          totalVoltage
        ], {
          queryId: `insertSensorReading_${Date.now()}`,
          label: 'Insert Sensor Reading'
        });
        
        logger.debug(`Stored sensor reading for rack ${rackName}: Temp=${temperature}, Humidity=${humidity}, Power=${totalPower} [${cycleId}]`);
        successCount++;
      } catch (sensorError) {
        logger.error(`Error storing sensor reading: ${sensorError.message} [${cycleId}]`, {
          error: sensorError.message,
          stack: sensorError.stack,
          sensor: sensor
        });
        errorCount++;
      }
    }
    
    // Update global counter
    sensorReadingsStored += successCount;
    
    logger.info(`Sensor reading storage complete: ${successCount} successful, ${errorCount} failed, ${noRackCount} skipped (no rack found) [${cycleId}]`);
  } catch (error) {
    logger.error(`Error storing sensor data: ${error.message} [${cycleId}]`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Check for threshold violations and create problem records
 * @param {Array} sensorData - Array of sensor reading objects
 * @param {Array} rackData - Array of rack objects
 * @param {Object} thresholds - Current threshold settings
 * @param {string} cycleId - Current monitoring cycle ID for logging
 */
async function checkThresholdViolations(sensorData, rackData, thresholds, cycleId) {
  try {
    logger.info(`Checking for threshold violations against ${sensorData.length} sensor readings [${cycleId}]`);
    
    // Create a map of racks for easier lookup
    const rackMap = {};
    for (const rack of rackData) {
      const rackName = rack.NAME || rack.name;
      if (rackName) {
        rackMap[rackName] = rack;
      }
    }
    
    // Track active problems to avoid creating duplicates
    const activeProblems = await getActiveProblems();
    logger.info(`Found ${activeProblems.length} existing active problems [${cycleId}]`);
    
    // Active problems map for quick lookups
    const activeProblemMap = {};
    for (const problem of activeProblems) {
      const key = `${problem.rack_id}-${problem.type}-${problem.alert_type}`;
      activeProblemMap[key] = problem;
    }
    
    let temperatureProblems = 0;
    let humidityProblems = 0;
    let powerProblems = 0;
    
    // Process each sensor reading
    for (const sensor of sensorData) {
      try {
        const rackName = sensor.RACK_NAME || sensor.rackName || sensor.name;
        
        if (!rackName) {
          logger.warn(`Sensor reading has no rack name, skipping threshold check [${cycleId}]`);
          continue;
        }
        
        // Get the rack ID
        const rackQuery = `
          SELECT id FROM racks 
          WHERE name = @param0
        `;
        
        const racks = await executeQuery(rackQuery, [rackName], {
          queryId: `getRackId_${Date.now()}`,
          label: 'Get Rack ID for Threshold Check'
        });
        
        if (!racks || racks.length === 0) {
          logger.warn(`No rack found with name ${rackName}, skipping threshold check [${cycleId}]`);
          continue;
        }
        
        const rackId = racks[0].id;
        const rack = rackMap[rackName];
        
        // Check temperature against thresholds
        if (sensor.TEMPERATURE || sensor.temperature) {
          const temperature = parseFloat(sensor.TEMPERATURE || sensor.temperature);
          
          // Check for high temperature
          if (temperature > thresholds.max_temp) {
            const problemKey = `${rackId}-Temperature-high`;
            
            // Only create a problem if one doesn't already exist
            if (!activeProblemMap[problemKey]) {
              await createProblem(
                rackId,
                'Temperature',
                `${temperature}°C`,
                `${thresholds.max_temp}°C`,
                'high',
                cycleId
              );
              temperatureProblems++;
              problemsDetected++;
              
              logger.info(`Created high temperature problem for rack ${rackName}: ${temperature}°C > ${thresholds.max_temp}°C [${cycleId}]`);
            } else {
              logger.debug(`Skipping duplicate high temperature problem for rack ${rackName} [${cycleId}]`);
            }
          }
          
          // Check for low temperature
          else if (temperature < thresholds.min_temp) {
            const problemKey = `${rackId}-Temperature-low`;
            
            // Only create a problem if one doesn't already exist
            if (!activeProblemMap[problemKey]) {
              await createProblem(
                rackId,
                'Temperature',
                `${temperature}°C`,
                `${thresholds.min_temp}°C`,
                'low',
                cycleId
              );
              temperatureProblems++;
              problemsDetected++;
              
              logger.info(`Created low temperature problem for rack ${rackName}: ${temperature}°C < ${thresholds.min_temp}°C [${cycleId}]`);
            } else {
              logger.debug(`Skipping duplicate low temperature problem for rack ${rackName} [${cycleId}]`);
            }
          }
        }
        
        // Check humidity against thresholds
        if (sensor.HUMIDITY || sensor.humidity) {
          const humidity = parseFloat(sensor.HUMIDITY || sensor.humidity);
          
          // Check for high humidity
          if (humidity > thresholds.max_humidity) {
            const problemKey = `${rackId}-Humidity-high`;
            
            // Only create a problem if one doesn't already exist
            if (!activeProblemMap[problemKey]) {
              await createProblem(
                rackId,
                'Humidity',
                `${humidity}%`,
                `${thresholds.max_humidity}%`,
                'high',
                cycleId
              );
              humidityProblems++;
              problemsDetected++;
              
              logger.info(`Created high humidity problem for rack ${rackName}: ${humidity}% > ${thresholds.max_humidity}% [${cycleId}]`);
            } else {
              logger.debug(`Skipping duplicate high humidity problem for rack ${rackName} [${cycleId}]`);
            }
          }
          
          // Check for low humidity
          else if (humidity < thresholds.min_humidity) {
            const problemKey = `${rackId}-Humidity-low`;
            
            // Only create a problem if one doesn't already exist
            if (!activeProblemMap[problemKey]) {
              await createProblem(
                rackId,
                'Humidity',
                `${humidity}%`,
                `${thresholds.min_humidity}%`,
                'low',
                cycleId
              );
              humidityProblems++;
              problemsDetected++;
              
              logger.info(`Created low humidity problem for rack ${rackName}: ${humidity}% < ${thresholds.min_humidity}% [${cycleId}]`);
            } else {
              logger.debug(`Skipping duplicate low humidity problem for rack ${rackName} [${cycleId}]`);
            }
          }
        }
        
        // Check power against thresholds
        if (rack && (rack.TOTAL_AMPS || rack.totalAmps)) {
          const current = parseFloat(rack.TOTAL_AMPS || rack.totalAmps);
          const isSinglePhase = rack.phase === 'Single Phase';
          const threshold = isSinglePhase ? 
                          thresholds.max_power_single_phase : 
                          thresholds.max_power_three_phase;
          
          if (current > threshold) {
            const problemKey = `${rackId}-Power-high`;
            
            // Only create a problem if one doesn't already exist
            if (!activeProblemMap[problemKey]) {
              await createProblem(
                rackId,
                'Power',
                `${current}A`,
                `${threshold}A`,
                'high',
                cycleId
              );
              powerProblems++;
              problemsDetected++;
              
              logger.info(`Created high power problem for rack ${rackName}: ${current}A > ${threshold}A [${cycleId}]`);
            } else {
              logger.debug(`Skipping duplicate high power problem for rack ${rackName} [${cycleId}]`);
            }
          }
        }
        
      } catch (checkError) {
        logger.error(`Error checking threshold violations for sensor: ${checkError.message} [${cycleId}]`, {
          error: checkError.message,
          stack: checkError.stack
        });
      }
    }
    
    logger.info(`Threshold violation checks complete: Created ${temperatureProblems} temperature, ${humidityProblems} humidity, and ${powerProblems} power problems [${cycleId}]`);
  } catch (error) {
    logger.error(`Error checking threshold violations: ${error.message} [${cycleId}]`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Get all active problems from database
 * @returns {Array} List of active problems
 */
async function getActiveProblems() {
  try {
    const query = `
      SELECT 
        id, rack_id, type, value, threshold, alert_type, status, created_at
      FROM problems
      WHERE status = 'active'
    `;
    
    const result = await executeQuery(query, [], {
      queryId: `getActiveProblems_${Date.now()}`,
      label: 'Get Active Problems'
    });
    
    return result || [];
  } catch (error) {
    logger.error(`Error getting active problems: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return [];
  }
}

/**
 * Create a new problem record in the database
 * @param {string} rackId - Rack ID
 * @param {string} type - Problem type (Temperature, Humidity, Power)
 * @param {string} value - Current value of the measurement
 * @param {string} threshold - Threshold that was violated
 * @param {string} alertType - Type of alert (high or low)
 * @param {string} cycleId - Current monitoring cycle ID for logging
 */
async function createProblem(rackId, type, value, threshold, alertType, cycleId) {
  try {
    // First verify we don't already have an active problem for this rack/type/alert combination
    const checkQuery = `
      SELECT COUNT(*) as count
      FROM problems
      WHERE rack_id = @param0
      AND type = @param1
      AND alert_type = @param2
      AND status = 'active'
    `;
    
    const checkResult = await executeQuery(checkQuery, [rackId, type, alertType], {
      queryId: `checkProblem_${Date.now()}`,
      label: 'Check Existing Problem'
    });
    
    // If a problem already exists, don't create a duplicate
    if (checkResult && checkResult.length > 0 && checkResult[0].count > 0) {
      logger.info(`Active problem already exists for rack ID ${rackId}, type ${type}, alert type ${alertType} [${cycleId}]`);
      return;
    }
    
    // Create new problem
    const query = `
      INSERT INTO problems (
        id, rack_id, type, value, threshold, status, alert_type, created_at, updated_at
      )
      VALUES (
        @param0, @param1, @param2, @param3, @param4, 'active', @param5, GETDATE(), GETDATE()
      )
    `;
    
    const problemId = uuidv4();
    
    await executeQuery(query, [
      problemId,
      rackId,
      type,
      value,
      threshold,
      alertType
    ], {
      queryId: `createProblem_${Date.now()}`,
      label: 'Create Problem'
    });
    
    logger.info(`Created new problem ${problemId}: ${type} alert (${alertType}) for rack ID ${rackId} with value ${value} vs threshold ${threshold} [${cycleId}]`);
    return problemId;
  } catch (error) {
    logger.error(`Error creating problem: ${error.message} [${cycleId}]`, {
      rackId,
      type,
      value,
      threshold,
      alertType,
      error: error.message,
      stack: error.stack
    });
  }
}

export default {
  startMonitoring,
  stopMonitoring,
  getMonitoringStatus,
  runMonitoringCycle
};