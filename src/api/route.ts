import axios, { AxiosRequestConfig } from 'axios';

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
    // Always add debug headers for better troubleshooting
    const augmentedHeaders = {
      ...request.headers,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Debug': 'true',
      'X-Request-ID': requestId
    };

    // Check if this is a local server call or an external API call
    const isLocalServerCall = request.destination.includes('localhost') || 
                            request.destination.includes('127.0.0.1') ||
                            (import.meta.env.VITE_LOCAL_SERVER_URL && 
                             request.destination.includes(import.meta.env.VITE_LOCAL_SERVER_URL));

    // Only add Authorization header for external APIs
    if (!isLocalServerCall) {
      const apiKey = import.meta.env.VITE_API_KEY;
      if (apiKey) {
        augmentedHeaders['Authorization'] = `Bearer ${apiKey}`;
        console.log(`Adding authorization header for external API call to: ${request.destination}`);
      }
    } else {
      console.log(`Skipping authorization header for local server call: ${request.destination}`);
    }

    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.destination,
      headers: augmentedHeaders,
      data: request.body,
      timeout: 30000, // Aumentado de 15000 a 30000 (30 segundos)
    };

    // Detailed logging of the request
    console.group(`🔷 API Request [${requestId}]`);
    console.log('Request details:', {
      id: requestId,
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.destination,
      isLocalServer: isLocalServerCall,
      headers: {...augmentedHeaders, 'Authorization': augmentedHeaders['Authorization'] ? '[REDACTED]' : undefined},
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
      headers: {...augmentedHeaders, 'Authorization': augmentedHeaders['Authorization'] ? '[REDACTED]' : undefined},
      body: request.body
    };

    // This will help debug HTTP interactions
    console.log('COMPLETE HTTP REQUEST LOG:', JSON.stringify(fullRequestLog, null, 2));

    const response = await axios(config);
    
    const responseTime = Date.now() - startTime;
    
    console.group(`🔶 API Response [${requestId}]`);
    console.log('Response details:', {
      id: requestId,
      timestamp: new Date().toISOString(),
      url: request.destination,
      method: request.method,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      responseTime: `${responseTime}ms`
    });
    console.log('Response data:', response.data);
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
    console.log('COMPLETE HTTP RESPONSE LOG:', JSON.stringify(fullResponseLog, null, 2));

    // Create log entry for debug panel
    const logEntry = {
      id: requestId,
      timestamp: new Date().toISOString(),
      endpoint: request.destination,
      method: request.method,
      status: response.status,
      responseTime,
      requestBody: request.body,
      requestHeaders: {...augmentedHeaders, 'Authorization': augmentedHeaders['Authorization'] ? '[REDACTED]' : undefined},
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
      console.error('Error logging API request:', e);
    }

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.group(`❌ API Error [${requestId}]`);
    console.error('API call failed:', {
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
      console.group(`🔍 API Error Details [${requestId}]`);
      console.log('Error message:', error.message);
      console.log('Error code:', error.code);
      
      if (error.request) {
        console.log('Request:', {
          method: error.config?.method,
          url: error.config?.url,
          headers: error.config?.headers ? 
            {...error.config.headers, Authorization: error.config.headers.Authorization ? '[REDACTED]' : undefined} : 
            undefined,
          data: error.config?.data
        });
      }
      
      if (error.response) {
        console.log('Response:', {
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
      requestHeaders: request.headers ? 
        {...request.headers, Authorization: request.headers.Authorization ? '[REDACTED]' : undefined} : 
        undefined,
      error: axios.isAxiosError(error) 
        ? {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            requestHeaders: error.config?.headers ? 
              {...error.config.headers, Authorization: error.config.headers.Authorization ? '[REDACTED]' : undefined} : 
              undefined
          }
        : String(error)
    };

    // Log the full error with all details for debugging
    console.log('COMPLETE HTTP ERROR LOG:', JSON.stringify(logEntry, null, 2));

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
      console.error('Error logging API error:', e);
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
      
      throw new Error(`API Error: ${error.message} (Status: ${error.response?.status || 'unknown'})`);
    }
    throw error;
  }
}