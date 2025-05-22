import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { setupLogger } from '../utils/logger.js';

// Initialize environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(dirname(__dirname), '.env') });

const logger = setupLogger();

/**
 * Debug function to test API endpoints with detailed logging
 * @param {string} url - The API URL to test
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @returns {Promise<Object>} The API response or error details
 */
export async function testApiEndpoint(url, method = 'GET') {
  logger.info(`Testing API endpoint: ${url} [${method}]`);
  
  try {
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      logger.warn('No API key found in environment variables');
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Add authorization if API key is available
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      logger.info('Using Bearer token authentication');
    }
    
    logger.debug('Request headers:', {
      ...headers,
      'Authorization': headers.Authorization ? '[REDACTED]' : undefined
    });
    
    const startTime = Date.now();
    const response = await axios({
      method,
      url,
      headers,
      timeout: 10000,
      validateStatus: null // Don't throw on error status codes
    });
    const duration = Date.now() - startTime;
    
    logger.info(`Response received in ${duration}ms with status ${response.status}`);
    logger.debug('Response headers:', response.headers);
    
    if (response.status >= 200 && response.status < 300) {
      logger.info('Request successful');
      
      // Check response structure
      if (response.data) {
        if (typeof response.data === 'object') {
          logger.debug('Response data structure:', Object.keys(response.data));
          
          if (response.data.status === 'Success' && Array.isArray(response.data.data)) {
            logger.info(`Response contains ${response.data.data.length} items in data array`);
          } else {
            logger.warn('Response does not match expected { status: "Success", data: [...] } structure');
          }
        } else {
          logger.warn(`Response data is not an object, but ${typeof response.data}`);
        }
      } else {
        logger.warn('Response data is empty or null');
      }
      
      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        duration,
        data: response.data,
        headers: response.headers
      };
    } else {
      logger.error(`Request failed with status ${response.status}: ${response.statusText}`);
      
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        duration,
        error: response.data,
        headers: response.headers
      };
    }
  } catch (error) {
    logger.error('Error testing API endpoint:', error.message);
    
    const errorDetails = {
      success: false,
      message: error.message,
      code: error.code
    };
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        errorDetails.status = error.response.status;
        errorDetails.statusText = error.response.statusText;
        errorDetails.data = error.response.data;
      }
      
      if (error.code === 'ECONNABORTED') {
        errorDetails.reason = 'Request timeout - the server took too long to respond';
      } else if (error.code === 'ECONNREFUSED') {
        errorDetails.reason = 'Connection refused - the server might be down or the URL is incorrect';
      } else if (error.code === 'ENOTFOUND') {
        errorDetails.reason = 'DNS lookup failed - check the hostname in the URL';
      } else if (error.response && error.response.status === 401) {
        errorDetails.reason = 'Authentication failed - check your API key';
      } else if (error.response && error.response.status === 403) {
        errorDetails.reason = 'Access forbidden - check your API key permissions';
      }
    }
    
    return errorDetails;
  }
}

export default {
  testApiEndpoint
};