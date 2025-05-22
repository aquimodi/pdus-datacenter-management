import { ApiResponse, SensorApiResponse, ProblemsApiResponse, PowerData, SensorData, ThresholdsApiResponse, Threshold } from '../types';
import { routeRequest } from '../api/route';
import { getGlobalDemoMode } from '../context/AppModeContext';

export const fetchRackData = async (): Promise<ApiResponse> => {
  // Determine if we're using the local Node.js server
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  const isDemo = getGlobalDemoMode();
  
  // API URL - if using local server, use the new endpoint
  let url = useLocalServer 
    ? `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/racks${isDemo ? '?demo=true' : ''}`
    : import.meta.env.VITE_API1_URL;
    
  // Add OData pagination parameters if using external API
  if (!useLocalServer && url) {
    // Check if URL already has query parameters
    const separator = url.includes('?') ? '&' : '?';
    
    // Don't add $top initially - it will be handled by the server with appropriate limits
    
    // Add count parameter for better pagination if not already present
    if (!url.includes('$count=')) {
      url += `${separator}$count=true`;
    }
    
    // Add small skip for first page
    if (!url.includes('$skip=')) {
      url += `&$skip=0`;
    }
  }
  
  console.log(`Consultando datos de racks desde: ${url} (servidor local: ${useLocalServer}, modo demo: ${isDemo})`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET'
      // El backend manejará la autenticación si es necesaria para APIs externas
    });

    console.log("Respuesta datos de racks:", response);

    if (useLocalServer) {
      return response;
    } else {
      // Map the new API response format to our internal format
      const powerData = response as unknown as PowerData[];
      
      if (!Array.isArray(powerData)) {
        console.error('Formato de respuesta API inesperado:', powerData);
        throw new Error('Formato de respuesta API inesperado: los datos no son un array');
      }
      
      try {
        const mappedData = powerData.map(item => ({
          id: item.id.toString(),
          rackId: item.rackId?.toString() || '',
          NAME: item.rackName || '',
          SITE: item.site || '',
          DC: item.dc || '',
          MAINTENANCE: "0", // Default value, could be updated if available
          MAXPOWER: item.capacityKw?.toString() || '0',
          MAXU: "42", // Default value, could be updated if available
          FREEU: "10", // Default value, could be updated if available
          TOTAL_VOLTS: item.totalVolts?.toString() || '0',
          TOTAL_AMPS: item.totalAmps?.toString() || '0',
          TOTAL_WATTS: item.totalWatts?.toString() || '0',
          TOTAL_KW: item.totalKw?.toString() || '0',
          TOTAL_KWH: item.totalKwh?.toString() || '0',
          TOTAL_VA: item.totalVa?.toString() || '0',
          TOTAL_PF: item.totalPf?.toString() || '0',
          L1_VOLTS: null, // These details are not in the new API
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
          phase: item.phase || 'Single Phase' // Default to Single Phase if not provided
        }));

        return {
          status: "Success",
          data: mappedData
        };
      } catch (error) {
        console.error('Error mapeando datos de potencia:', error);
        throw new Error(`Error mapeando datos de potencia: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error obteniendo datos de racks:', error);
    throw error;
  }
};

export const fetchSensorData = async (): Promise<SensorApiResponse> => {
  // Determine if we're using the local Node.js server
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  const isDemo = getGlobalDemoMode();
  
  // API URL - if using local server, use the new endpoint
  let url = useLocalServer 
    ? `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/sensors${isDemo ? '?demo=true' : ''}`
    : import.meta.env.VITE_API2_URL;
  
  // Add OData pagination parameters if using external API
  if (!useLocalServer && url) {
    // Check if URL already has query parameters
    const separator = url.includes('?') ? '&' : '?';
    
    // Don't add $top initially - it will be handled by the server with appropriate limits
    
    // Add count parameter for better pagination if not already present
    if (!url.includes('$count=')) {
      url += `${separator}$count=true`;
    }
    
    // Add small skip for first page
    if (!url.includes('$skip=')) {
      url += `&$skip=0`;
    }
  }
  
  console.log(`Consultando datos de sensores desde: ${url} (servidor local: ${useLocalServer}, modo demo: ${isDemo})`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET'
      // El backend manejará la autenticación si es necesaria para APIs externas
    });

    console.log("Respuesta datos de sensores:", response);

    if (useLocalServer) {
      return response;
    } else {
      // Map the new API response format to our internal format
      const sensorData = response as unknown as SensorData[];
      
      if (!Array.isArray(sensorData)) {
        console.error('Formato de respuesta API inesperado:', sensorData);
        throw new Error('Formato de respuesta API inesperado: los datos no son un array');
      }
      
      try {
        const mappedData = sensorData.map(item => ({
          id: item.id.toString(),
          nodeId: item.nodeId?.toString() || '',
          sensorIndex: item.sensorIndex?.toString() || '',
          rackId: item.rackId?.toString() || '',
          RACK_NAME: item.rackName || '',
          SITE: item.site || '',
          DC: item.dc || '',
          TEMPERATURE: item.temperature?.toString() || '',
          HUMIDITY: item.humidity?.toString() || '',
          lastUpdate: item.lastUpdate || '',
          status: item.status || ''
        }));

        return {
          status: "Success",
          data: mappedData
        };
      } catch (error) {
        console.error('Error mapeando datos de sensores:', error);
        throw new Error(`Error mapeando datos de sensores: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error obteniendo datos de sensores:', error);
    throw error;
  }
};

export const fetchProblemsData = async (isHistorical: boolean = false): Promise<ProblemsApiResponse> => {
  // Determine if we're using the local Node.js server
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  const isDemo = getGlobalDemoMode();
  
  // API URL for problems
  const url = `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/problems?historical=${isHistorical}${isDemo ? '&demo=true' : ''}`;
  
  console.log(`Obteniendo problemas ${isHistorical ? 'históricos' : 'actuales'} desde: ${url} (modo demo: ${isDemo})`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET',
    });

    console.log(`Respuesta datos de problemas (${isHistorical ? 'históricos' : 'actuales'}):`, response);

    return response;
  } catch (error) {
    console.error(`Error obteniendo problemas ${isHistorical ? 'históricos' : 'actuales'}:`, error);
    throw error;
  }
};

// New function to fetch threshold values
export const fetchThresholds = async (): Promise<ThresholdsApiResponse> => {
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  const isDemo = getGlobalDemoMode();
  
  const url = `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/thresholds${isDemo ? '?demo=true' : ''}`;
  
  console.log(`Obteniendo umbrales desde: ${url} (modo demo: ${isDemo})`);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'GET',
    });

    console.log("Respuesta de umbrales:", response);
    return response;
  } catch (error) {
    console.error('Error obteniendo umbrales:', error);
    throw error;
  }
};

// New function to update threshold values
export const updateThresholds = async (thresholds: Partial<Threshold>): Promise<{status: string; message?: string}> => {
  const useLocalServer = import.meta.env.VITE_USE_LOCAL_SERVER === 'true';
  
  const url = `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/thresholds`;
  
  console.log(`Actualizando umbrales en: ${url}`, thresholds);
  
  try {
    const response = await routeRequest({
      destination: url,
      method: 'PUT',
      body: thresholds
    });

    console.log("Respuesta actualización umbrales:", response);
    return response;
  } catch (error) {
    console.error('Error actualizando umbrales:', error);
    throw error;
  }
};