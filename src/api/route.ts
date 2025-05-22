import axios, { AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { useDebug } from '../context/DebugContext';

interface RouteRequest {
  destination: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
}

// For logging outside components
let addApiLog: ((log: any) => void) | null = null;

export const setApiLogFunction = (logFn: (log: any) => void) => {
  addApiLog = logFn;
};

export async function routeRequest(request: RouteRequest) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // Add debug header if needed
    const augmentedHeaders = {
      ...request.headers,
      'Content-Type': 'application/json',
      'X-Debug': 'true',
      'X-Request-ID': requestId
    };

    // IMPORTANT FIX: Only add API key for external API calls (not for local server)
    const isLocalServerCall = request.destination.includes('localhost') || 
                            request.destination.includes('127.0.0.1') ||
                            (import.meta.env.VITE_LOCAL_SERVER_URL && 
                             request.destination.includes(import.meta.env.VITE_LOCAL_SERVER_URL));

    // Only add Authorization header for external APIs
    if (!isLocalServerCall) {
      const apiKey = import.meta.env.VITE_API_KEY;
      if (apiKey) {
        augmentedHeaders['Authorization'] = `Bearer ${apiKey}`;
        console.log(`Añadiendo cabecera de autorización para llamada API externa a: ${request.destination}`);
      }
    } else {
      console.log(`Omitiendo cabecera de autorización para llamada al servidor local: ${request.destination}`);
    }

    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.destination,
      headers: augmentedHeaders,
      data: request.body,
    };

    console.group(`🔷 Petición API [${requestId}]`);
    console.log('Detalles de la petición:', {
      id: requestId,
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.destination,
      isLocalServer: isLocalServerCall,
      headers: augmentedHeaders,
      body: request.body
    });
    console.groupEnd();

    // Log the full request with all details for debugging
    const fullRequestLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      type: 'request',
      method: request.method,
      url: request.destination,
      isLocalServer: isLocalServerCall,
      headers: augmentedHeaders,
      body: request.body
    };

    // This will help debug HTTP interactions
    console.log('REGISTRO HTTP PETICIÓN COMPLETA:', JSON.stringify(fullRequestLog, null, 2));

    const response = await axios(config);
    
    const responseTime = Date.now() - startTime;
    
    console.group(`🔶 Respuesta API [${requestId}]`);
    console.log('Detalles de la respuesta:', {
      id: requestId,
      timestamp: new Date().toISOString(),
      url: request.destination,
      method: request.method,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      responseTime: `${responseTime}ms`
    });
    console.log('Datos de la respuesta:', response.data);
    console.groupEnd();

    // Log the full response with all details for debugging
    const fullResponseLog = {
      id: requestId,
      timestamp: new Date().toISOString(),
      type: 'response',
      method: request.method,
      url: request.destination,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      responseTime
    };

    // This will help debug HTTP interactions
    console.log('REGISTRO HTTP RESPUESTA COMPLETA:', JSON.stringify(fullResponseLog, null, 2));

    // Create log entry for debug panel
    const logEntry = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: request.destination,
      method: request.method,
      status: response.status,
      responseTime,
      requestBody: request.body,
      requestHeaders: augmentedHeaders,
      responseBody: response.data,
      responseHeaders: response.headers
    };

    // Try to dispatch event for debug panel
    try {
      // Use the function if available
      if (addApiLog) {
        addApiLog(logEntry);
      }
      
      // Also dispatch an event that the DebugPanel can listen to
      const event = new CustomEvent('api-log', { detail: logEntry });
      window.dispatchEvent(event);
    } catch (e) {
      console.error('Error al registrar petición API:', e);
    }

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.group(`❌ Error API [${requestId}]`);
    console.error('Llamada API fallida:', {
      id: requestId,
      timestamp: new Date().toISOString(),
      url: request.destination,
      method: request.method,
      body: request.body,
      error: axios.isAxiosError(error) 
        ? {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
          }
        : String(error)
    });
    console.groupEnd();

    // Detailed error logging for debugging purposes
    if (axios.isAxiosError(error)) {
      console.group(`🔍 Detalles del Error API [${requestId}]`);
      console.log('Mensaje de error:', error.message);
      console.log('Código de error:', error.code);
      
      if (error.request) {
        console.log('Petición:', {
          method: error.config?.method,
          url: error.config?.url,
          headers: error.config?.headers,
          data: error.config?.data
        });
      }
      
      if (error.response) {
        console.log('Respuesta:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        });
      }
      console.groupEnd();
    }
    
    // Create log entry for debug panel
    const logEntry = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: request.destination,
      method: request.method,
      status: axios.isAxiosError(error) && error.response ? error.response.status : 0,
      responseTime,
      requestBody: request.body,
      requestHeaders: request.headers,
      error: axios.isAxiosError(error) 
        ? {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            requestHeaders: error.config?.headers
          }
        : String(error)
    };

    // Log the full error with all details for debugging
    console.log('REGISTRO HTTP ERROR COMPLETO:', JSON.stringify(logEntry, null, 2));

    // Try to dispatch event for debug panel
    try {
      // Use the function if available
      if (addApiLog) {
        addApiLog(logEntry);
      }
      
      // Also dispatch an event that the DebugPanel can listen to
      const event = new CustomEvent('api-log', { detail: logEntry });
      window.dispatchEvent(event);
    } catch (e) {
      console.error('Error al registrar error API:', e);
    }

    if (axios.isAxiosError(error)) {
      // Enhanced error handling with detailed information
      const errorInfo = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      
      throw new Error(`Error API: ${error.message} (Estado: ${error.response?.status || 'desconocido'})`);
    }
    throw error;
  }
}