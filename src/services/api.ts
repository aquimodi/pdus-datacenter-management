import { ApiResponse, SensorApiResponse, ProblemsApiResponse, PowerData, SensorData, ThresholdsApiResponse, Threshold } from '../types';
import { routeRequest } from '../api/route';

export const fetchRackData = async (): Promise<ApiResponse> => {
  // Determine if we're using the local Node.js server
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  
  // API URL - if using local server, use the local endpoint
  const url = useLocalServer 
    ? `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/racks`
    : import.meta.env.VITE_API1_URL;
    
  console.log(`Fetching racks data from: ${url} (using local server: ${useLocalServer})`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET'
    });

    console.log("Racks data response:", response);
    return response;
  } catch (error) {
    console.error('Error fetching racks data:', error);
    throw error;
  }
};

export const fetchSensorData = async (): Promise<SensorApiResponse> => {
  // Determine if we're using the local Node.js server
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  
  // API URL - if using local server, use the local endpoint
  const url = useLocalServer 
    ? `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/sensors`
    : import.meta.env.VITE_API2_URL;
  
  console.log(`Fetching sensor data from: ${url} (using local server: ${useLocalServer})`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET'
    });

    console.log("Sensor data response:", response);
    return response;
  } catch (error) {
    console.error('Error fetching sensor data:', error);
    throw error;
  }
};

export const fetchProblemsData = async (isHistorical: boolean = false): Promise<ProblemsApiResponse> => {
  // Always use the local server for problems
  const url = `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/problems?historical=${isHistorical}`;
  
  console.log(`Fetching ${isHistorical ? 'historical' : 'current'} problems from: ${url}`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET',
    });

    console.log(`Problems data (${isHistorical ? 'historical' : 'current'}) response:`, response);
    return response;
  } catch (error) {
    console.error(`Error fetching ${isHistorical ? 'historical' : 'current'} problems:`, error);
    throw error;
  }
};

// Function to fetch threshold values
export const fetchThresholds = async (): Promise<ThresholdsApiResponse> => {
  const url = `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/thresholds`;
  
  console.log(`Fetching thresholds from: ${url}`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET',
    });

    console.log("Thresholds response:", response);
    return response;
  } catch (error) {
    console.error('Error fetching thresholds:', error);
    throw error;
  }
};

// Function to update threshold values
export const updateThresholds = async (thresholds: Partial<Threshold>): Promise<{status: string; message?: string}> => {
  const url = `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/thresholds`;
  
  console.log(`Updating thresholds at: ${url}`, thresholds);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'PUT',
      body: thresholds
    });

    console.log("Thresholds update response:", response);
    return response;
  } catch (error) {
    console.error('Error updating thresholds:', error);
    throw error;
  }
};