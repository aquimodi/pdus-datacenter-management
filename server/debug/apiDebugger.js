import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupLogger } from '../utils/logger.js';

// Setup file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: join(dirname(__dirname), '.env') });

// Initialize logger
const logger = setupLogger();

// Create Express app for debugging
const app = express.Router();

/**
 * @route GET /api/debug/test-api
 * @desc Test API connectivity and parse response
 * @access Public
 */
app.get('/test-api', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({
      status: 'Error',
      message: 'URL parameter is required'
    });
  }
  
  try {
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      logger.warn('API key not found in environment variables');
    }
    
    logger.info(`Testing API connection to ${url}`);
    
    // Prepare headers
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    // Make request
    const response = await axios.get(url, {
      headers,
      timeout: 10000
    });
    
    // Analyze the response structure
    const responseAnalysis = {
      statusCode: response.status,
      contentType: response.headers['content-type'],
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      itemCount: Array.isArray(response.data) ? response.data.length : null,
      sampleData: Array.isArray(response.data) && response.data.length > 0 
        ? response.data[0]
        : response.data,
      propertyNames: Array.isArray(response.data) && response.data.length > 0
        ? Object.keys(response.data[0])
        : typeof response.data === 'object' 
          ? Object.keys(response.data)
          : null
    };
    
    // Return the analysis
    return res.status(200).json({
      status: 'Success',
      url,
      responseAnalysis,
      rawData: response.data
    });
  } catch (error) {
    logger.error(`Error testing API at ${url}:`, error);
    
    return res.status(500).json({
      status: 'Error',
      message: error.message,
      code: error.code,
      url,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
  }
});

/**
 * @route POST /api/debug/transform-data
 * @desc Test data transformation for APIs
 * @access Public
 */
app.post('/transform-data', (req, res) => {
  const { data, format } = req.body;
  
  if (!data) {
    return res.status(400).json({
      status: 'Error',
      message: 'Data parameter is required'
    });
  }
  
  try {
    let transformed;
    
    switch (format) {
      case 'power':
        transformed = transformPowerData(data);
        break;
      case 'sensor':
        transformed = transformSensorData(data);
        break;
      default:
        return res.status(400).json({
          status: 'Error',
          message: 'Invalid format specified. Use "power" or "sensor".'
        });
    }
    
    return res.status(200).json({
      status: 'Success',
      original: data,
      transformed
    });
  } catch (error) {
    logger.error(`Error transforming data:`, error);
    
    return res.status(500).json({
      status: 'Error',
      message: error.message,
      stack: error.stack
    });
  }
});

// Helper functions for data transformation
function transformPowerData(data) {
  if (!Array.isArray(data)) {
    throw new Error('Power data must be an array');
  }
  
  return data.map(item => ({
    id: item.id?.toString() || '',
    rackId: item.rackId?.toString() || '',
    NAME: item.rackName || item.name || '',
    SITE: item.site || '',
    DC: item.dc || '',
    MAINTENANCE: item.maintenance?.toString() || "0",
    MAXPOWER: item.capacityKw?.toString() || "7",
    MAXU: "42", // Default
    FREEU: "10", // Default
    TOTAL_VOLTS: item.totalVolts?.toString() || null,
    TOTAL_AMPS: item.totalAmps?.toString() || null,
    TOTAL_WATTS: item.totalWatts?.toString() || null,
    TOTAL_KW: item.totalKw?.toString() || null,
    TOTAL_KWH: item.totalKwh?.toString() || null,
    TOTAL_VA: item.totalVa?.toString() || null,
    TOTAL_PF: item.totalPf?.toString() || null,
    L1_VOLTS: null,
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
    phase: item.phase || 'Single Phase'
  }));
}

function transformSensorData(data) {
  if (!Array.isArray(data)) {
    throw new Error('Sensor data must be an array');
  }
  
  return data.map(item => ({
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
}

export default app;