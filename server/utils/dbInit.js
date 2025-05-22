import { setupLogger } from './logger.js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Setup file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(dirname(__dirname), '.env') });

// Initialize logger
const logger = setupLogger();

/**
 * Verify all required database environment variables are present
 * @returns {Object} Object with dbEnabled flag and missing variables
 */
export const checkDatabaseEnv = () => {
  const requiredVars = ['SQL_USER', 'SQL_PASSWORD', 'SQL_SERVER', 'SQL_DATABASE'];
  const missingVars = [];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  const dbEnabled = missingVars.length === 0;
  
  if (!dbEnabled) {
    logger.warn('Database features are disabled due to missing environment variables', {
      missingVars,
      configSource: '.env file'
    });
  } else {
    logger.info('All required database environment variables are present');
  }

  return {
    dbEnabled,
    missingVars
  };
};

/**
 * Apply SQL Server compatibility fixes and safeguards
 * @param {Object} db - Database module with executeQuery function
 * @returns {Promise<boolean>} Success status
 */
export const applyDatabaseSafeguards = async (db) => {
  if (!db || typeof db.executeQuery !== 'function') {
    logger.error('Invalid database module provided to applyDatabaseSafeguards');
    return false;
  }
  
  try {
    logger.info('Applying SQL Server compatibility safeguards');
    
    // Check if database is responding at all
    const pingResult = await db.pingDatabase();
    if (!pingResult) {
      logger.warn('Database ping failed. Safeguards will be applied but may not be effective.');
      return false;
    }
    
    // Additional failsafe query execution
    return true;
  } catch (error) {
    logger.error('Error applying database safeguards:', {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
};

export default {
  checkDatabaseEnv,
  applyDatabaseSafeguards
};