import sql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupLogger } from '../utils/logger.js';

// Load environment variables from server/.env
dotenv.config({ path: join(dirname(dirname(fileURLToPath(import.meta.url))), '.env') });

const logger = setupLogger();

// SQL Server configuration with improved validation and fallbacks
const sqlConfig = {
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || '',
  server: process.env.SQL_SERVER || 'localhost', 
  database: process.env.SQL_DATABASE || 'master',
  port: Number(process.env.SQL_PORT) || 1433,
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'false' ? false : true,
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true' ? true : false,
    connectTimeout: Number(process.env.SQL_CONNECTION_TIMEOUT) || 15000,
    requestTimeout: Number(process.env.SQL_REQUEST_TIMEOUT) || 15000,
    connectionRetryAttempts: 2,
    connectionRetryInterval: 1000
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Check if required database variables are set
const isMissingRequiredDbVars = !process.env.SQL_USER || !process.env.SQL_PASSWORD || !process.env.SQL_SERVER || !process.env.SQL_DATABASE;

// Set database enabled flag based on environment variables
let dbEnabled = !isMissingRequiredDbVars;

if (isMissingRequiredDbVars) {
  logger.warn('Missing required database environment variables. Database features will be unavailable.', {
    userSet: !!process.env.SQL_USER,
    passwordSet: !!process.env.SQL_PASSWORD,
    serverSet: !!process.env.SQL_SERVER,
    databaseSet: !!process.env.SQL_DATABASE
  });
} else {
  logger.info('SQL Configuration initialized', { 
    server: sqlConfig.server, 
    database: sqlConfig.database,
    user: sqlConfig.user,
    port: sqlConfig.port,
    options: sqlConfig.options,
    pool: sqlConfig.pool
  });
}

// Connection pool
let pool = null;
let isConnecting = false;
let connectionPromise = null;

// Initialize SQL Server connection pool with retry logic and improved error handling
const initializePool = async () => {
  // If database is disabled due to missing variables, don't attempt connection
  if (!dbEnabled) {
    logger.warn('Database connection is disabled due to missing environment variables');
    return null;
  }
  
  if (isConnecting) {
    // If already connecting, return the existing promise
    logger.debug('Connection already in progress, returning existing promise');
    return connectionPromise;
  }
  
  isConnecting = true;
  logger.info('Initializing SQL Server connection pool');
  
  connectionPromise = (async () => {
    const maxRetries = 2;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount < maxRetries) {
      try {
        logger.info(`Attempting to connect to SQL Server (attempt ${retryCount + 1}/${maxRetries})`, {
          server: sqlConfig.server,
          database: sqlConfig.database
        });
        
        // Use a more defensive approach
        try {
          // First check if server is reachable with a simple ping-like attempt
          logger.debug(`Testing if server ${sqlConfig.server} is reachable...`);
          const tempConfig = {...sqlConfig, database: 'master', connectTimeout: 5000};
          const tempPool = new sql.ConnectionPool(tempConfig);
          const connection = await Promise.race([
            tempPool.connect(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Connection timeout after 5000ms`)), 5000)
            )
          ]);
          
          tempPool.close();
          logger.debug(`Basic connection test successful for server: ${sqlConfig.server}`);
          
          // Now attempt the real connection
          const newPool = await new sql.ConnectionPool(sqlConfig).connect();
          await newPool.request().query("SELECT 1 AS result");
          pool = newPool;
          
          logger.info('Connected to SQL Server successfully', {
            server: sqlConfig.server,
            database: sqlConfig.database,
            poolSize: pool.size,
            available: pool.available,
            borrowed: pool.borrowed,
            pending: pool.pending
          });
          
          // Handle pool error events
          pool.on('error', err => {
            logger.error('SQL Pool Error:', {
              error: err.message,
              code: err.code,
              stack: err.stack,
              state: err.state
            });
            
            // Schedule reconnect if the error indicates a disconnection
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('connection')) {
              logger.warn('Connection error detected. Will attempt to reconnect...', {
                code: err.code,
                message: err.message
              });
              
              // Reset the pool for reconnection on next query
              pool = null;
              isConnecting = false;
            }
          });
          
          return pool;
        } catch (connError) {
          logger.error('Error creating SQL connection pool:', {
            error: connError.message,
            code: connError.code,
            stack: connError.stack
          });
          throw connError;
        }
      } catch (err) {
        lastError = err;
        logger.error(`Failed to connect to SQL Server (attempt ${retryCount + 1}/${maxRetries}):`, {
          error: err.message,
          code: err.code,
          stack: err.stack,
          server: sqlConfig.server,
          database: sqlConfig.database
        });
        
        // Wait before retrying
        const waitTime = 2000 * (retryCount + 1);
        logger.info(`Waiting ${waitTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
      }
    }
    
    // All retries failed - log and disable database functionality
    const errorMsg = lastError ? 
      `Failed to connect to SQL Server after ${maxRetries} attempts: ${lastError.message}` :
      `Failed to connect to SQL Server after ${maxRetries} attempts`;
      
    logger.error(errorMsg, {
      server: sqlConfig.server,
      database: sqlConfig.database,
      maxRetries
    });
    
    // Automatically disable database functionality after failed connection attempts
    dbEnabled = false;
    logger.warn('Database functionality has been disabled due to connection failures');
    
    // Return null instead of throwing to prevent crashing the application
    return null;
  })();
  
  try {
    const result = await connectionPromise;
    isConnecting = false;
    return result;
  } catch (error) {
    isConnecting = false;
    // Return null instead of rethrowing to prevent crashing the application
    logger.error('Fatal connection error: ', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
};

// Execute SQL query with parameters and enhanced error handling
export const executeQuery = async (query, params = [], options = {}) => {
  const queryId = options.queryId || `query_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const label = options.label || 'Unnamed Query';
  
  // If database is disabled, log warning and return empty array
  if (!dbEnabled) {
    logger.warn(`Database is disabled. Query "${label}" not executed.`, { queryId });
    return [];
  }
  
  logger.debug(`Executing SQL query: ${label}`, { 
    queryId,
    query,
    params: params.map((p, i) => ({ 
      index: i, 
      value: typeof p === 'object' ? 
        safeStringify(p) : 
        String(p) 
    })),
    options 
  });
  
  const startTime = Date.now();
  
  try {
    if (!pool) {
      logger.info(`No active connection pool for query ${queryId}, initializing...`);
      pool = await initializePool();
      
      // If pool initialization failed, return empty result
      if (!pool) {
        logger.warn(`Failed to initialize connection pool for query ${queryId}. Returning empty result.`);
        return [];
      }
    }
    
    const request = pool.request();
    
    // Add parameters if any
    for (let index = 0; index < params.length; index++) {
      const param = params[index];
      // Skip null or undefined parameters
      if (param === null || param === undefined) {
        logger.warn(`Parameter at index ${index} is ${param === null ? 'null' : 'undefined'}`, { queryId });
        continue;
      }
      
      try {
        const paramName = `param${index}`;
        request.input(paramName, param);
        logger.debug(`Added parameter ${paramName}`, { 
          queryId, 
          paramName, 
          paramType: typeof param,
          paramValue: typeof param === 'object' ? safeStringify(param) : String(param)
        });
      } catch (paramError) {
        logger.error(`Error adding parameter at index ${index}:`, {
          queryId,
          error: paramError.message,
          paramValue: typeof param === 'object' ? safeStringify(param) : String(param)
        });
        // Continue with other parameters
      }
    }
    
    // Set timeout for this specific request
    // IMPORTANT: Reduce timeout for thresholds queries to prevent hanging
    const timeout = options.timeout || 
                   (query.toLowerCase().includes('threshold') ? 5000 : 10000);
    request.timeout = timeout;
    logger.debug(`Set request timeout to ${timeout}ms`, { queryId });
    
    logger.debug(`Executing query: ${query}`, { queryId });
    
    // Execute the query with timeout protection
    const queryPromise = request.query(query);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout + 1000);
    });
    
    // Race between query execution and timeout
    const result = await Promise.race([queryPromise, timeoutPromise]);
    
    const duration = Date.now() - startTime;
    logger.debug(`Query executed successfully: ${label}`, { 
      queryId, 
      duration: `${duration}ms`, 
      rowCount: result.recordset ? result.recordset.length : 0,
      affectedRows: result.rowsAffected ? result.rowsAffected[0] : 0
    });
    
    return result.recordset || [];
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`Database query error: ${label}`, { 
      queryId, 
      duration: `${duration}ms`,
      error: err.message,
      code: err.code,
      state: err.state,
      class: err.class,
      lineNumber: err.lineNumber,
      sqlErrorNumber: err.number,
      query 
    });
    
    // Check if error is due to connection issues
    if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || 
        (err.message && (err.message.includes('connection') || err.message.includes('timeout')))) {
      logger.warn('Connection error detected. Will attempt to reconnect...', {
        code: err.code,
        message: err.message
      });
      
      // Reset the pool for reconnection on next query
      pool = null;
      isConnecting = false;
    }
    
    // Return empty array instead of throwing to prevent application crash
    return [];
  }
};

// Safely stringify an object, handling circular references
function safeStringify(obj) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
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
    return `[Error during JSON stringify: ${error.message}]`;
  }
}

// Ping database to check connection status (with shorter timeout)
export const pingDatabase = async () => {
  // If database is disabled, return false immediately
  if (!dbEnabled) {
    logger.warn('Database is disabled. Ping skipped.');
    return false;
  }
  
  const pingId = `ping_${Date.now()}`;
  logger.info(`Pinging database`, { pingId });
  const startTime = Date.now();
  
  try {
    if (!pool) {
      logger.info('No active pool for ping, initializing...');
      pool = await initializePool();
      
      if (!pool) {
        logger.warn('Failed to initialize pool for ping');
        return false;
      }
    }
    
    // Add timeout for ping query - REDUCED TIMEOUT FROM PREVIOUS VERSION
    const pingTimeout = 5000; // 5 seconds for ping (reduced from original)
    
    // Use simpler query approach with timeout
    try {
      const request = pool.request();
      request.timeout = pingTimeout;
      const result = await request.query('SELECT 1 AS result');
      
      const duration = Date.now() - startTime;
      
      if (result && result.recordset && result.recordset.length > 0) {
        logger.info(`Database ping successful`, { pingId, duration: `${duration}ms` });
        return true;
      } else {
        logger.warn(`Database ping returned empty result`, { pingId, duration: `${duration}ms` });
        return false;
      }
    } catch (pingError) {
      const duration = Date.now() - startTime;
      logger.error(`Database ping failed with error: ${pingError.message}`, {
        pingId,
        duration: `${duration}ms`,
        error: pingError.message,
        code: pingError.code
      });
      return false;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Database ping failed after ${duration}ms`, { 
      pingId, 
      duration: `${duration}ms`, 
      error: error.message 
    });
    return false;
  }
};

// Close pool on application shutdown
process.on('SIGINT', async () => {
  if (pool) {
    try {
      logger.info('Closing SQL connection pool due to application shutdown');
      await pool.close();
      logger.info('SQL connection pool closed successfully');
    } catch (err) {
      logger.error('Error closing SQL connection pool:', {
        error: err.message,
        stack: err.stack
      });
    }
  }
  process.exit(0);
});

// Common database functions with fallback for disabled database
export const getRacks = async () => {
  if (!dbEnabled) {
    logger.warn('Database is disabled. Returning empty racks array.');
    return [];
  }
  
  const queryId = `getRacks_${Date.now()}`;
  logger.info(`Fetching rack data`, { queryId });
  
  const query = `
    SELECT 
      id,
      name AS NAME,
      site AS SITE,
      datacenter AS DC,
      maintenance AS MAINTENANCE,
      max_power AS MAXPOWER,
      max_units AS MAXU,
      free_units AS FREEU,
      phase,
      created_at,
      updated_at
    FROM racks
  `;
  
  try {
    const result = await executeQuery(query, [], { 
      queryId, 
      label: 'Get All Racks',
      timeout: 8000 // Added explicit timeout
    });
    logger.info(`Successfully retrieved ${result.length} racks`, { queryId });
    
    if (result.length > 0) {
      logger.debug(`Sample rack data (first item):`, { 
        queryId, 
        firstRack: result[0] 
      });
    }
    
    return result;
  } catch (error) {
    logger.error(`Failed to fetch racks`, { 
      queryId, 
      error: error.message 
    });
    return [];
  }
};

export const getSensorReadings = async () => {
  if (!dbEnabled) {
    logger.warn('Database is disabled. Returning empty sensor readings array.');
    return [];
  }
  
  const queryId = `getSensorReadings_${Date.now()}`;
  logger.info(`Fetching sensor readings`, { queryId });
  
  const query = `
    SELECT 
      sr.id,
      r.name AS RACK_NAME,
      r.site AS SITE,
      r.datacenter AS DC,
      sr.temperature AS TEMPERATURE,
      sr.humidity AS HUMIDITY,
      sr.total_power AS TOTAL_KW,
      sr.total_current AS TOTAL_AMPS,
      sr.total_voltage AS TOTAL_VOLTS,
      sr.created_at
    FROM sensor_readings sr
    JOIN racks r ON r.id = sr.rack_id
    WHERE sr.created_at >= DATEADD(MINUTE, -5, GETDATE())
  `;
  
  try {
    const result = await executeQuery(query, [], { 
      queryId, 
      label: 'Get Recent Sensor Readings',
      timeout: 8000 // Added explicit timeout
    });
    logger.info(`Successfully retrieved ${result.length} sensor readings`, { queryId });
    
    if (result.length > 0) {
      logger.debug(`Sample sensor reading (first item):`, { 
        queryId, 
        firstReading: result[0] 
      });
    } else {
      logger.warn(`No sensor readings found in the last 5 minutes`, { queryId });
    }
    
    return result;
  } catch (error) {
    logger.error(`Failed to fetch sensor readings`, { 
      queryId, 
      error: error.message 
    });
    return [];
  }
};

export const getProblems = async (isHistorical = false) => {
  if (!dbEnabled) {
    logger.warn('Database is disabled. Returning empty problems array.');
    return [];
  }
  
  const queryId = `getProblems_${Date.now()}`;
  logger.info(`Fetching ${isHistorical ? 'historical' : 'current'} problems data`, { queryId });
  
  try {
    // Try to use stored procedures first (more efficient and reliable)
    const spName = isHistorical ? 'sp_get_historical_problems' : 'sp_get_active_problems';
    logger.info(`Attempting to use stored procedure: ${spName}`, { queryId });
    
    try {
      const result = await executeQuery(`EXEC ${spName}`, [], {
        queryId,
        label: `Get ${isHistorical ? 'Historical' : 'Active'} Problems (SP)`,
        timeout: 5000 // Short timeout for SPs
      });
      
      if (result && result.length > 0) {
        logger.info(`Successfully retrieved ${result.length} problems using stored procedure`, { queryId });
        return result;
      }
      
      logger.warn(`Stored procedure ${spName} returned no results, falling back to direct query`, { queryId });
    } catch (spError) {
      logger.warn(`Error using stored procedure ${spName}: ${spError.message}. Falling back to direct query.`, {
        queryId,
        error: spError.message
      });
    }
    
    // Fall back to direct query if SP fails
    const query = `
      SELECT 
        p.id,
        r.name AS rack,
        r.site,
        r.datacenter AS dc,
        p.type,
        p.value,
        p.threshold,
        p.alert_type,
        p.created_at AS time,
        p.resolved_at AS resolved,
        p.status
      FROM problems p
      JOIN racks r ON r.id = p.rack_id
      WHERE p.status = ${isHistorical ? "'resolved'" : "'active'"}
      ORDER BY p.created_at DESC
    `;
    
    const result = await executeQuery(query, [], { 
      queryId, 
      label: `Get ${isHistorical ? 'Historical' : 'Active'} Problems (Direct Query)`,
      timeout: 8000 // Added explicit timeout
    });
    logger.info(`Successfully retrieved ${result.length} ${isHistorical ? 'historical' : 'current'} problems from database`, { queryId });
    
    if (result.length > 0) {
      logger.debug(`Sample problem data (first item):`, { 
        queryId, 
        firstProblem: result[0] 
      });
    } else {
      logger.warn(`No ${isHistorical ? 'historical' : 'current'} problems found`, { queryId });
    }
    
    return result;
  } catch (error) {
    logger.error(`Failed to fetch ${isHistorical ? 'historical' : 'current'} problems`, { 
      queryId, 
      error: error.message
    });
    return [];
  }
};

// Function to get threshold values
export const getThresholds = async () => {
  // Default thresholds to return if database is disabled or error occurs
  const defaultThresholds = [{
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
  }];

  if (!dbEnabled) {
    logger.warn('Database is disabled. Returning default thresholds array.');
    return defaultThresholds;
  }
  
  const queryId = `getThresholds_${Date.now()}`;
  logger.info(`Fetching threshold values`, { queryId });
  
  try {
    // Try using the view first (most efficient)
    try {
      logger.info(`Trying to fetch thresholds from vw_current_thresholds view`, { queryId });
      const viewResult = await executeQuery(
        "SELECT * FROM vw_current_thresholds WHERE name = 'global'", 
        [], 
        { 
          queryId: `${queryId}_view`, 
          label: 'Get Thresholds (View)',
          timeout: 3000 // Very short timeout for view
        }
      );
      
      if (viewResult && viewResult.length > 0) {
        logger.info(`Successfully retrieved thresholds using view`, { queryId });
        return viewResult;
      }
      
      logger.warn(`View returned no thresholds, trying stored procedure`, { queryId });
    } catch (viewError) {
      logger.warn(`Failed to fetch thresholds using view: ${viewError.message}. Trying stored procedure.`, { queryId });
    }
    
    // Try calling the stored procedure next
    try {
      logger.info(`Trying to fetch thresholds using sp_get_thresholds stored procedure`, { queryId });
      const result = await executeQuery("EXEC sp_get_thresholds", [], { 
        queryId, 
        label: 'Get Thresholds (SP)', 
        timeout: 5000 // Short timeout for SP
      });
      
      if (result && result.length > 0) {
        logger.info(`Successfully retrieved thresholds using stored procedure`, { queryId });
        return result;
      }
      
      logger.warn(`Stored procedure returned no thresholds, falling back to direct query`, { queryId });
    } catch (spError) {
      logger.warn(`Failed to fetch thresholds using stored procedure: ${spError.message}. Falling back to direct query.`, { queryId });
    }
    
    // Fall back to direct query if stored procedure fails
    logger.info(`Trying direct query to fetch thresholds`, { queryId });
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
      FROM thresholds
      WHERE name = 'global'
      ORDER BY created_at DESC
    `;
    
    const result = await executeQuery(query, [], { 
      queryId, 
      label: 'Get Thresholds (Direct Query)',
      timeout: 5000 // Short timeout
    });
    
    if (result.length === 0) {
      logger.warn(`No threshold values found in database, returning defaults`, { queryId });
      return defaultThresholds;
    }
    
    logger.info(`Successfully retrieved ${result.length} threshold records`, { queryId });
    return result;
  } catch (error) {
    logger.error(`Failed to fetch thresholds`, { 
      queryId, 
      error: error.message 
    });
    return defaultThresholds;
  }
};

// Function to update threshold values
export const updateThresholds = async (thresholds) => {
  if (!dbEnabled) {
    logger.warn('Database is disabled. Threshold update request ignored.');
    return false;
  }
  
  const queryId = `updateThresholds_${Date.now()}`;
  logger.info(`Updating threshold values`, { 
    queryId,
    thresholds: safeStringify(thresholds)
  });
  
  try {
    // Create a new threshold record (for versioning)
    const query = `
      INSERT INTO thresholds 
        (name, min_temp, max_temp, min_humidity, max_humidity, max_power_single_phase, max_power_three_phase)
      VALUES
        ('global', @param0, @param1, @param2, @param3, @param4, @param5)
    `;
    
    const params = [
      thresholds.min_temp,
      thresholds.max_temp,
      thresholds.min_humidity,
      thresholds.max_humidity,
      thresholds.max_power_single_phase,
      thresholds.max_power_three_phase
    ];
    
    await executeQuery(query, params, { 
      queryId, 
      label: 'Create New Threshold Version',
      timeout: 5000 // Short timeout for insert
    });
    
    logger.info(`Successfully created new threshold version`, { queryId });
    return true;
  } catch (error) {
    logger.error(`Failed to update thresholds`, { 
      queryId, 
      error: error.message
    });
    return false;
  }
};

export default {
  executeQuery,
  getRacks,
  getSensorReadings,
  getProblems,
  getThresholds,
  updateThresholds,
  initializePool,
  pingDatabase
};

// Explicitly export the initializePool function
export { initializePool, dbEnabled };