import axios from 'axios';
import { setupLogger } from './logger.js';
import { mockSensorData } from '../data/mockData.js';

const logger = setupLogger();

/**
 * Sleep/delay function for use in retry logic
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Circuit breaker implementation to prevent repeated calls to failing services
 */
class CircuitBreaker {
  constructor() {
    this.states = {}; // Store circuit state for each endpoint
    this.failureThreshold = 3; // Number of failures before opening circuit
    this.resetTimeout = 30000; // Time before trying again (30 seconds)
    
    logger.debug('Circuit breaker initialized', {
      failureThreshold: this.failureThreshold,
      resetTimeout: this.resetTimeout
    });
  }

  /**
   * Check if circuit is open (failing) for a given endpoint
   * @param {string} endpoint - API endpoint to check
   * @returns {boolean} True if circuit is open (failing)
   */
  isOpen(endpoint) {
    const state = this.states[endpoint];
    if (!state) {
      logger.debug(`Circuit for ${endpoint} does not exist, considering closed`);
      return false;
    }
    
    if (state.status === 'open') {
      // Check if it's time to try again
      const now = Date.now();
      if (now >= state.nextTry) {
        logger.info(`Circuit for ${endpoint} is due for retry, transitioning to half-open`);
        this.halfOpen(endpoint);
        return false;
      }
      
      const remainingTime = Math.round((state.nextTry - now) / 1000);
      logger.debug(`Circuit for ${endpoint} is open, ${remainingTime}s remaining until retry`);
      return true;
    }
    
    logger.debug(`Circuit for ${endpoint} is ${state?.status || 'closed'}`);
    return false;
  }

  /**
   * Record a successful API call
   * @param {string} endpoint - API endpoint
   */
  recordSuccess(endpoint) {
    logger.debug(`Recording success for ${endpoint}`);
    this.states[endpoint] = {
      status: 'closed',
      failures: 0,
      lastFailure: null,
      nextTry: null
    };
    
    logger.info(`Circuit closed for ${endpoint}`);
  }

  /**
   * Record a failed API call
   * @param {string} endpoint - API endpoint
   */
  recordFailure(endpoint) {
    const state = this.states[endpoint] || {
      status: 'closed',
      failures: 0,
      lastFailure: null,
      nextTry: null
    };
    
    state.failures += 1;
    state.lastFailure = Date.now();
    
    logger.debug(`Recording failure #${state.failures} for ${endpoint}`);
    
    if (state.failures >= this.failureThreshold) {
      state.status = 'open';
      state.nextTry = Date.now() + this.resetTimeout;
      
      logger.warn(`Circuit opened for endpoint: ${endpoint}. Next retry at ${new Date(state.nextTry).toISOString()}`, {
        endpoint,
        failures: state.failures,
        status: 'open',
        nextRetryTime: new Date(state.nextTry).toISOString(),
        nextRetryInSeconds: Math.round(this.resetTimeout / 1000)
      });
    } else {
      logger.debug(`Circuit for ${endpoint} remains closed, failure count: ${state.failures}/${this.failureThreshold}`);
    }
    
    this.states[endpoint] = state;
  }

  /**
   * Set the circuit to half-open state (testing if service recovered)
   * @param {string} endpoint - API endpoint
   */
  halfOpen(endpoint) {
    if (this.states[endpoint]) {
      this.states[endpoint].status = 'half-open';
      logger.info(`Circuit half-opened for endpoint: ${endpoint}. Testing if service recovered.`, {
        endpoint,
        previousFailures: this.states[endpoint].failures,
        status: 'half-open'
      });
    }
  }
  
  /**
   * Get the current state of all circuits
   * @returns {Object} Current circuit breaker states
   */
  getStates() {
    return this.states;
  }
}

// Create a global circuit breaker instance
const circuitBreaker = new CircuitBreaker();

/**
 * Helper function to check if a URL is an OData API URL
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL looks like an OData API
 */
const isODataUrl = (url) => {
  if (!url) return false;
  
  // Common indicators of OData endpoints
  return url.includes('$filter') || 
         url.includes('$select') || 
         url.includes('$expand') || 
         url.includes('$orderby') || 
         url.includes('$top') || 
         url.includes('$skip') || 
         url.includes('/odata/') || 
         url.includes('/OData/');
};

/**
 * Helper function to add OData pagination parameters to a URL
 * @param {string} url - The API URL
 * @param {number} skip - Number of records to skip
 * @param {number} top - Max number of records to return
 * @returns {string} URL with pagination parameters
 */
const addODataPaginationParams = (url, skip = 0, top = 50) => {
  const separator = url.includes('?') ? '&' : '?';
  let newUrl = url;
  
  // If URL already has $top or $skip, replace them
  // For top, we use a smaller number to avoid issues with server-side limitations
  if (url.includes('$top=')) {
    // Replace existing $top parameter with a safe value
    const topRegex = /\$top=(\d+)/;
    newUrl = newUrl.replace(topRegex, `$top=${top}`);
  } else {
    // Add new $top parameter
    newUrl += `${separator}$top=${top}`;
  }
  
  if (url.includes('$skip=')) {
    // Replace existing $skip parameter
    const skipRegex = /\$skip=(\d+)/;
    newUrl = newUrl.replace(skipRegex, `$skip=${skip}`);
  } else {
    // Add new $skip parameter with appropriate separator
    newUrl += `&$skip=${skip}`;
  }
  
  return newUrl;
};

/**
 * Fetch all pages from an OData API with support for pagination
 * @param {string} baseUrl - The base API URL
 * @param {Object} requestConfig - Axios request configuration
 * @param {string} requestId - Request ID for logging
 * @param {number} pageSize - Number of records per page
 * @returns {Promise<Array>} Combined results from all pages
 */
const fetchAllPages = async (baseUrl, requestConfig, requestId, pageSize = 50) => {
  const allResults = [];
  let currentPage = 0;
  let hasMorePages = true;
  let totalRecords = 0;
  
  logger.info(`Iniciando obtención de datos paginados desde OData API: ${baseUrl}`, {
    requestId,
    pageSize,
    initialPage: currentPage
  });

  while (hasMorePages) {
    const skip = currentPage * pageSize;
    const paginatedUrl = addODataPaginationParams(baseUrl, skip, pageSize);
    
    logger.info(`Obteniendo página ${currentPage + 1} (skip=${skip}, top=${pageSize})`, {
      requestId,
      url: paginatedUrl,
      page: currentPage + 1
    });
    
    try {
      const startTime = Date.now();
      const response = await axios.get(paginatedUrl, requestConfig);
      const duration = Date.now() - startTime;
      
      logger.info(`Página ${currentPage + 1} obtenida en ${duration}ms con estado ${response.status}`, {
        requestId,
        page: currentPage + 1,
        duration,
        status: response.status
      });

      // Handle different response formats
      let pageData = [];
      
      if (response.data && Array.isArray(response.data)) {
        // Direct array response
        pageData = response.data;
      } else if (response.data && response.data.value && Array.isArray(response.data.value)) {
        // OData standard format with 'value' property
        pageData = response.data.value;
        
        // Check for OData metadata to get total count if available
        if (response.data['@odata.count']) {
          totalRecords = response.data['@odata.count'];
          logger.info(`Total de registros según metadatos OData: ${totalRecords}`, {
            requestId
          });
        }
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        // Custom format with 'data' property
        pageData = response.data.data;
      } else {
        logger.warn(`Formato de respuesta desconocido en página ${currentPage + 1}`, {
          requestId,
          page: currentPage + 1,
          dataType: typeof response.data,
          keys: response.data ? Object.keys(response.data) : []
        });
        
        // Try to extract data anyway
        if (response.data && typeof response.data === 'object') {
          // Find arrays in the response
          for (const key in response.data) {
            if (Array.isArray(response.data[key])) {
              pageData = response.data[key];
              logger.info(`Se extrajo array de datos de la propiedad "${key}"`, {
                requestId,
                items: pageData.length
              });
              break;
            }
          }
        }
      }
      
      // Track progress
      allResults.push(...pageData);
      logger.info(`Progreso: ${allResults.length} registros obtenidos hasta ahora`, {
        requestId,
        page: currentPage + 1,
        pageRecords: pageData.length,
        totalRecords: allResults.length
      });
      
      // Determine if we should fetch more pages
      if (pageData.length < pageSize) {
        // We received fewer records than the page size, so we're likely at the end
        hasMorePages = false;
        logger.info(`Fin de la paginación: última página contiene menos de ${pageSize} registros`, {
          requestId,
          records: pageData.length,
          totalRecords: allResults.length
        });
      } else if (totalRecords > 0 && allResults.length >= totalRecords) {
        // We've reached the total count according to OData metadata
        hasMorePages = false;
        logger.info(`Fin de la paginación: se obtuvieron todos los ${totalRecords} registros`, {
          requestId
        });
      } else if (response.data && response.data['@odata.nextLink']) {
        // OData provides a next link - we could use it but for simplicity we'll stick with skip/top
        logger.debug(`API proporciona nextLink para la paginación`, {
          requestId,
          nextLink: response.data['@odata.nextLink']
        });
        // Continue with our skip/top approach for consistency
      }
      
      // Move to next page
      currentPage++;
      
      // Safety check to prevent infinite loops - max 20 pages (1,000 records at 50 per page)
      // Reduced from 100 to 20 to avoid memory issues
      if (currentPage >= 20) {
        logger.warn(`Límite de seguridad alcanzado: 20 páginas (${pageSize * 20} registros)`, {
          requestId
        });
        hasMorePages = false;
      }
      
      // Small delay between page requests to avoid overwhelming the server
      if (hasMorePages) {
        await sleep(300); // Add a small delay between requests
      }
      
    } catch (error) {
      logger.error(`Error obteniendo página ${currentPage + 1}: ${error.message}`, {
        requestId,
        page: currentPage + 1,
        error: error.message,
        code: error.code
      });
      
      // If we've already fetched some data, return what we have
      if (allResults.length > 0) {
        logger.warn(`Devolviendo ${allResults.length} registros obtenidos antes del error`, {
          requestId
        });
        
        hasMorePages = false;
      } else {
        // If no data fetched at all, rethrow for the caller to handle
        throw error;
      }
    }
  }
  
  logger.info(`Completada la obtención paginada: ${allResults.length} registros totales`, {
    requestId,
    pages: currentPage,
    totalRecords: allResults.length
  });
  
  return allResults;
};

/**
 * Utility function to fetch data from external APIs with authentication and retry logic
 * @param {string} url - The API URL
 * @param {string} source - Description of the data source (for logging)
 * @param {Object} options - Additional options
 * @param {number} options.retries - Number of retries (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {boolean} options.useMockOnFail - Whether to use mock data if all retries fail (default: true)
 * @param {boolean} options.useCircuitBreaker - Whether to use circuit breaker pattern (default: true)
 * @param {boolean} options.usePagination - Whether to use pagination for OData APIs (default: true)
 * @param {number} options.pageSize - Number of records per page for paginated requests (default: 50)
 * @returns {Promise<Object>} The API response data
 */
export const fetchExternalAPI = async (url, source, options = {}) => {
  const requestId = `api_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  if (!url) {
    logger.error(`No URL provided for ${source} API`, { requestId });
    throw new Error(`No URL provided for ${source} API`);
  }

  const {
    retries = 3,
    retryDelay = 1000,
    useMockOnFail = true,
    useCircuitBreaker = true,
    usePagination = true,
    pageSize = 50, // Reduced page size
    debug = false,
    ...axiosOptions
  } = options;
  
  logger.info(`Iniciando petición a API externa: ${source}`, {
    requestId,
    url,
    source
  });
  
  // Check if circuit breaker is open for this endpoint
  if (useCircuitBreaker && circuitBreaker.isOpen(url)) {
    logger.warn(`Circuit breaker open for ${url}. Skipping API call and using fallback.`, {
      requestId,
      url,
      source
    });
    
    if (useMockOnFail) {
      logger.info(`Using mock data for ${source} due to open circuit`, { requestId });
      return getMockDataForSource(source);
    }
    
    throw new Error(`Service unavailable: ${source} API is currently unavailable (circuit open)`);
  }

  logger.info(`Consultando datos de la API externa ${source}: ${url}`, { requestId });
  
  let lastError = null;
  
  // Try the request up to 'retries' times
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Calculate exponential backoff delay: retryDelay * 2^attempt (with some randomness)
      const expBackoff = retryDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.3 * expBackoff; // Add up to 30% jitter
      const delayWithJitter = expBackoff + jitter;
      
      logger.info(`Reintento ${attempt}/${retries} para API ${source} tras ${Math.round(delayWithJitter)}ms`, {
        requestId,
        attempt,
        maxRetries: retries,
        delay: Math.round(delayWithJitter)
      });
      
      await sleep(delayWithJitter);
    }
    
    try {
      // Get the API key from environment variables
      const apiKey = process.env.API_KEY;
      
      // Prepare the request configuration with Bearer token authentication
      const requestConfig = {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Request-ID': requestId
        },
        timeout: 10000, // 10 second timeout
        validateStatus: status => {
          // Accept 2xx status codes and a few others that might be valid in some contexts
          if (status >= 200 && status < 300) return true;
          
          // Handle specific non-standard status codes
          if (status === 530) {
            logger.warn(`Received FTP status code 530 (not logged in) from ${url}`, {
              requestId,
              url,
              status
            });
            return false;
          }
          
          return false;
        },
        ...axiosOptions
      };
      
      // Add API key as Bearer token if available
      if (apiKey) {
        requestConfig.headers['Authorization'] = `Bearer ${apiKey}`;
        logger.debug(`Añadida cabecera de autorización Bearer para ${source}`, {
          requestId
        });
      } else {
        logger.debug(`No se encontró API key para ${source}`, {
          requestId
        });
      }

      // Log the detailed request configuration
      if (debug) {
        logger.debug(`Configuración de la petición API para ${source}:`, {
          requestId,
          url,
          method: requestConfig.method || 'GET',
          timeout: requestConfig.timeout,
          headers: {
            ...requestConfig.headers,
            Authorization: requestConfig.headers.Authorization ? '[REDACTADO]' : undefined
          }
        });
      }

      // Determine if this is an OData API and if we should use pagination
      const isOData = isODataUrl(url);
      const shouldUsePagination = usePagination && isOData;
      
      if (isOData) {
        logger.info(`API detectada como OData: ${url}`, { 
          requestId, 
          usePagination: shouldUsePagination
        });
      }

      logger.info(`Enviando petición ${requestConfig.method || 'GET'} a ${url}${shouldUsePagination ? ' (con paginación)' : ''}`, { 
        requestId,
        attempt: attempt + 1,
        maxRetries: retries + 1
      });
      
      let response;
      let duration;
      
      if (shouldUsePagination) {
        // Use pagination for OData APIs
        const startTime = Date.now();
        
        try {
          // Fetch all pages and combine results
          const allPages = await fetchAllPages(url, requestConfig, requestId, pageSize);
          duration = Date.now() - startTime;
          
          logger.info(`Petición paginada completada en ${duration}ms. Obtenidos ${allPages.length} registros totales.`, {
            requestId,
            duration,
            recordCount: allPages.length
          });
          
          response = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            data: allPages  // Return the combined array directly
          };
        } catch (paginationError) {
          logger.error(`Error en petición paginada: ${paginationError.message}`, {
            requestId,
            error: paginationError.message,
            code: paginationError.code
          });
          
          throw paginationError;
        }
      } else {
        // Standard non-paginated request
        const startTime = Date.now();
        response = await axios.get(url, requestConfig);
        duration = Date.now() - startTime;
        
        logger.info(`Respuesta recibida en ${duration}ms con estado ${response.status}`, {
          requestId,
          duration,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers['content-type']
        });
      }

      // Enhanced validation of response structure
      if (!response || !response.data) {
        logger.error(`Respuesta inválida o vacía recibida de la API ${source}`, {
          requestId,
          response: response ? 'Datos vacíos' : 'Sin respuesta'
        });
        
        throw new Error(`Respuesta inválida o vacía recibida de la API ${source}`);
      }

      // New API format returns an array directly, not wrapped in a status object
      if (Array.isArray(response.data)) {
        logger.info(`Datos obtenidos correctamente de la API ${source} en el intento ${attempt + 1}`, {
          requestId,
          itemCount: response.data.length,
          format: 'array'
        });
        
        // Record success in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordSuccess(url);
        }
        
        // For new API format, structure response as if it came from the old API
        return response.data;
      }
      
      // Old API format with status wrapper
      if (response.data && response.data.status === "Success") {
        logger.info(`Datos obtenidos correctamente de la API ${source} en el intento ${attempt + 1}`, {
          requestId,
          itemCount: response.data.data?.length,
          format: 'status-wrapper'
        });
        
        // Record success in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordSuccess(url);
        }
        
        return response.data;
      } else {
        // Log the error details for debugging
        const errorMsg = `Respuesta inválida de la API ${source}: ${JSON.stringify(response.data)}`;
        logger.error(errorMsg, {
          requestId,
          responseData: response.data
        });
        
        lastError = new Error(errorMsg);
        
        // Record failure in circuit breaker if it's a data format issue
        if (useCircuitBreaker) {
          circuitBreaker.recordFailure(url);
        }
        
        // Continue to next retry
      }
    } catch (error) {
      lastError = error;
      
      // Check if it's a status code 530 error
      let statusCode = null;
      if (error.response) {
        statusCode = error.response.status;
      } else if (error.message && error.message.includes('status code 530')) {
        statusCode = 530;
      }
      
      // Special handling for status code 530 (FTP not logged in)
      if (statusCode === 530) {
        logger.warn(`Received status code 530 from API ${source}. This may indicate an FTP authentication issue.`, {
          requestId,
          url,
          error: error.message,
          code: error.code
        });
        
        // Continue with retry logic rather than failing immediately
      } else {
        // Log API call failure
        logger.error(`Llamada API fallida: ${error.message}`, {
          requestId,
          url,
          error: error.message,
          code: error.code,
          response: error.response ? {
            status: error.response.status,
            statusText: error.response.statusText
          } : null
        });
      }

      // Log detailed error information
      if (axios.isAxiosError(error)) {
        logger.error(`Error al obtener datos de la API ${source} (intento ${attempt + 1}/${retries + 1}):`, {
          requestId,
          message: error.message,
          code: error.code,
          status: error.response?.status
        });

        // Enhanced error logging for common issues
        if (error.code === 'ECONNABORTED') {
          logger.error(`Tiempo de espera (${error.config?.timeout}ms) excedido para la API ${source}`, {
            requestId,
            timeout: error.config?.timeout
          });
        } else if (error.code === 'ECONNREFUSED') {
          logger.error(`Conexión rechazada a la API ${source}. El servidor podría estar caído o inaccesible.`, {
            requestId,
            url
          });
        } else if (error.response && error.response.status === 401) {
          logger.error(`Autenticación fallida para la API ${source}. Comprobar API key.`, {
            requestId
          });
        } else if (error.response && error.response.status === 403) {
          logger.error(`Acceso prohibido a la API ${source}. Comprobar permisos.`, {
            requestId
          });
        }
        
        // Record failure in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordFailure(url);
        }
      } else {
        logger.error(`Error no-Axios al obtener datos de la API ${source} (intento ${attempt + 1}/${retries + 1}):`, {
          requestId,
          error: error.message,
          stack: error.stack
        });
        
        // Record failure in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordFailure(url);
        }
      }
      
      // If this is not the last retry, continue to next attempt
      if (attempt < retries) {
        continue;
      }
    }
  }
  
  // If we've exhausted all retries and useMockOnFail is true, return mock data
  if (useMockOnFail) {
    logger.warn(`Todos los ${retries + 1} intentos de obtener datos de la API ${source} han fallado. Usando datos simulados como alternativa.`, {
      requestId,
      url,
      source
    });
    
    return getMockDataForSource(source);
  }
  
  // If we don't want to use mock data, throw the last error
  logger.error(`Error al obtener datos de la API ${source} después de ${retries + 1} intentos y sin usar datos simulados`, {
    requestId,
    error: lastError?.message
  });
  
  throw lastError || new Error(`Error al obtener datos de la API ${source} después de ${retries + 1} intentos`);
};

/**
 * Helper function to get appropriate mock data based on the source
 * @param {string} source - Description of the data source
 * @returns {Object} Mock data appropriate for the source
 */
function getMockDataForSource(source) {
  // Determine which mock data to return based on the source
  if (source.toLowerCase().includes('rack')) {
    logger.debug(`Devolviendo datos simulados de racks para ${source}`);
    return { status: "Success", data: mockSensorData.data };
  } else if (source.toLowerCase().includes('sensor')) {
    logger.debug(`Devolviendo datos simulados de sensores para ${source}`);
    return { 
      status: "Success", 
      data: mockSensorData.data.map(rack => ({
        RACK_NAME: rack.NAME,
        TEMPERATURE: rack.TEMPERATURE || (18 + Math.random() * 17).toFixed(1),
        HUMIDITY: rack.HUMIDITY || (40 + Math.random() * 35).toFixed(1),
        SITE: rack.SITE,
        DC: rack.DC
      }))
    };
  } else if (source.toLowerCase().includes('threshold')) {
    logger.debug(`Devolviendo datos simulados de umbrales para ${source}`);
    return {
      status: "Success",
      data: [{
        id: "mock-threshold-id",
        name: "global",
        min_temp: 18.0,
        max_temp: 32.0,
        min_humidity: 40.0,
        max_humidity: 70.0,
        max_power_single_phase: 16.0,
        max_power_three_phase: 48.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    };
  }
  
  // Generic mock data
  logger.debug(`Devolviendo datos simulados vacíos para ${source}`);
  return { status: "Success", data: [] };
}

/**
 * Attempts to get data from database first, falls back to external API if DB fails,
 * and finally falls back to mock data if both fail
 * @param {Function} dbFunction - Function to get data from database
 * @param {string} apiUrl - External API URL for fallback
 * @param {string} source - Description of the data source (for logging)
 * @param {Object} options - Additional options for API requests
 * @returns {Promise<Array>} The data array
 */
export const getDataWithFallback = async (dbFunction, apiUrl, source, options = {}) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  logger.info(`Iniciando recuperación de datos para ${source} con opciones de fallback`, {
    requestId,
    source,
    apiUrl
  });
  
  // First, try to get data from database
  try {
    logger.info(`[${requestId}] Intentando obtener ${source} desde la base de datos`, {
      requestId,
      source,
      method: 'database'
    });
    
    const startTime = Date.now();
    const data = await dbFunction();
    const duration = Date.now() - startTime;
    
    logger.info(`[${requestId}] Consulta a base de datos completada en ${duration}ms`, {
      requestId,
      duration,
      dataFound: data && data.length > 0
    });
    
    if (data && Array.isArray(data) && data.length > 0) {
      logger.info(`[${requestId}] Recuperados ${data.length} registros de ${source} desde la base de datos`, {
        requestId,
        itemCount: data.length,
        source,
        method: 'database',
        duration
      });
      
      return data;
    } else {
      // If database returned empty data, log a warning and try API
      logger.warn(`[${requestId}] La base de datos devolvió un resultado vacío para ${source}. Probando API externa.`, {
        requestId,
        source
      });
    }
  } catch (dbError) {
    // Log the database error
    logger.warn(`[${requestId}] Acceso a base de datos fallido para ${source}: ${dbError.message}. Probando API externa.`, {
      requestId,
      error: dbError.message,
      code: dbError.code,
      source
    });
  }
  
  // If database access fails or returns empty data, try to fetch from external API
  try {
    logger.info(`[${requestId}] Recurriendo a API externa para ${source}`, {
      requestId,
      apiUrl,
      source
    });
    
    // Check if this is an OData API that needs pagination
    const needsPagination = isODataUrl(apiUrl);
    
    logger.info(`[${requestId}] Tipo de API: ${needsPagination ? 'OData con paginación' : 'API estándar'}`, {
      requestId,
      apiUrl,
      usePagination: needsPagination
    });
    
    const startTime = Date.now();
    const apiResponse = await fetchExternalAPI(apiUrl, source, { 
      ...options,
      debug: true, // Enable detailed debugging for API calls
      requestId,
      usePagination: needsPagination, // Enable pagination for OData APIs
      pageSize: 50   // Reduced page size from 100 to 50 to avoid server limitations
    });
    const duration = Date.now() - startTime;
    
    logger.info(`[${requestId}] Petición a API completada en ${duration}ms`, {
      requestId,
      duration,
      responseReceived: !!apiResponse
    });
    
    // Handle both old and new API formats
    if (apiResponse && apiResponse.status === "Success" && apiResponse.data && Array.isArray(apiResponse.data)) {
      // Old API format with status wrapper
      logger.info(`[${requestId}] Recuperados ${apiResponse.data.length} registros de ${source} desde API externa (formato antiguo)`, {
        requestId,
        itemCount: apiResponse.data.length,
        source,
        method: 'api-old-format',
        duration
      });
      
      return apiResponse.data;
    } else if (apiResponse && Array.isArray(apiResponse)) {
      // New API format returns array directly
      logger.info(`[${requestId}] Recuperados ${apiResponse.length} registros de ${source} desde API externa (formato nuevo)`, {
        requestId,
        itemCount: apiResponse.length,
        source,
        method: 'api-new-format',
        duration
      });
      
      return apiResponse;
    } else {
      logger.warn(`[${requestId}] API externa devolvió datos inválidos o vacíos para ${source}`, {
        requestId,
        source
      });
    }
  } catch (apiError) {
    logger.error(`[${requestId}] Tanto el acceso a la base de datos como a la API fallaron para ${source}`, {
      requestId,
      dbError: 'Ver logs anteriores',
      apiError: apiError.message,
      source
    });
    
    // If configured to use mock data as final fallback
    if (options.useMockOnFail !== false) {
      logger.warn(`[${requestId}] Usando datos simulados como último recurso para ${source}`, {
        requestId,
        source
      });
      
      const mockData = getMockDataForSource(source).data;
      logger.info(`[${requestId}] Recuperados ${mockData.length} registros simulados de ${source}`, {
        requestId,
        itemCount: mockData.length,
        source,
        method: 'mock-data'
      });
      
      return mockData;
    }
    
    logger.error(`[${requestId}] No se pudieron recuperar datos de ${source}: ${apiError.message}`, {
      requestId,
      error: apiError.message,
      source
    });
    
    throw new Error(`No se pudieron recuperar datos de ${source}: ${apiError.message}`);
  }
  
  // If we get here, it means both database and API failed in some way but didn't throw an error
  // Return mock data as a last resort
  logger.warn(`[${requestId}] Recurriendo a datos simulados para ${source} después de que todos los métodos de recuperación fallaran`, {
    requestId,
    source
  });
  
  const mockData = getMockDataForSource(source).data;
  logger.info(`[${requestId}] Recuperados ${mockData.length} registros simulados de ${source} como último recurso`, {
    requestId,
    itemCount: mockData.length,
    source,
    method: 'mock-data-last-resort'
  });
  
  return mockData;
};

/**
 * Check if an external API is reachable
 * @param {string} url - The API URL to check
 * @param {Object} options - Additional axios options
 * @returns {Promise<boolean>} True if API is reachable, false otherwise
 */
export const isApiReachable = async (url, options = {}) => {
  const requestId = `ping_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  if (!url) {
    logger.debug(`No se puede comprobar alcance: No se proporcionó URL`, { requestId });
    return false;
  }
  
  logger.info(`Comprobando si la API en ${url} es alcanzable`, { requestId, url });
  const startTime = Date.now();
  
  try {
    const apiKey = process.env.API_KEY;
    const headers = {
      'Accept': 'application/json',
      'X-Request-ID': requestId
    };

    // Add API key if available
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    logger.debug(`Intentando petición HEAD a ${url}`, { 
      requestId, 
      method: 'HEAD',
      timeout: options.timeout || 5000
    });
    
    // First try a HEAD request as it's more efficient
    const response = await axios.head(url, {
      headers,
      timeout: 5000,
      validateStatus: status => {
        // Accept any status < 500 as "reachable" except 530
        if (status === 530) {
          logger.warn(`Received status 530 from HEAD request to ${url}`, {
            requestId,
            status
          });
          return false;
        }
        return status < 500;
      },
      ...options
    });
    
    const duration = Date.now() - startTime;
    logger.info(`API en ${url} es alcanzable (petición HEAD, estado: ${response.status})`, { 
      requestId, 
      duration: `${duration}ms`,
      status: response.status
    });
    
    return true;
  } catch (headError) {
    logger.debug(`Petición HEAD a ${url} falló: ${headError.message}. Intentando GET como alternativa.`, {
      requestId,
      error: headError.message,
      code: headError.code
    });
    
    try {
      // If HEAD fails, some servers don't support it, so try GET as fallback
      const apiKey = process.env.API_KEY;
      const headers = {
        'Accept': 'application/json',
        'X-Request-ID': requestId
      };

      // Add API key if available
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      logger.debug(`Intentando petición GET a ${url}`, { 
        requestId, 
        method: 'GET',
        timeout: options.timeout || 5000
      });
      
      const response = await axios.get(url, {
        headers,
        timeout: 5000,
        validateStatus: status => {
          // Accept any status < 500 as "reachable" except 530
          if (status === 530) {
            logger.warn(`Received status 530 from GET request to ${url}`, {
              requestId,
              status
            });
            return false;
          }
          return status < 500;
        },
        ...options
      });
      
      const duration = Date.now() - startTime;
      logger.info(`API en ${url} es alcanzable (petición GET, estado: ${response.status})`, { 
        requestId, 
        duration: `${duration}ms`,
        status: response.status
      });
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`API en ${url} no es alcanzable: ${error.message}`, {
        requestId,
        duration: `${duration}ms`,
        error: error.message,
        code: error.code
      });
      
      return false;
    }
  }
};

/**
 * Diagnose API endpoint issues and provide detailed information
 * @param {string} url - The API URL to diagnose
 * @param {boolean} includeResponseData - Whether to include full response data in the diagnosis
 * @returns {Promise<Object>} Diagnosis report
 */
export const diagnoseApiEndpoint = async (url, includeResponseData = false) => {
  const diagnosisId = `diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  logger.info(`Realizando diagnóstico de endpoint API para ${url}`, { diagnosisId, url });
  
  const diagnosis = {
    url,
    timestamp: new Date().toISOString(),
    isReachable: false,
    responseTime: null,
    statusCode: null,
    errorCode: null,
    errorDetails: null,
    responseData: null,
    responseType: null,
    contentType: null,
    recommendations: []
  };

  const startTime = Date.now();
  
  try {
    // Check if the URL is valid
    if (!url) {
      diagnosis.errorDetails = 'No se proporcionó URL';
      diagnosis.recommendations.push('Proporcionar una URL válida para el diagnóstico');
      
      logger.error(`Diagnóstico falló: No se proporcionó URL`, { diagnosisId });
      return diagnosis;
    }
    
    // Try to validate the URL format
    try {
      new URL(url);
    } catch (urlError) {
      diagnosis.errorDetails = 'Formato de URL inválido';
      diagnosis.recommendations.push('Comprobar formato de URL (debería ser como http://ejemplo.com/api/ruta)');
      
      logger.error(`Diagnóstico falló: Formato de URL inválido - ${url}`, { 
        diagnosisId,
        error: urlError.message
      });
      
      return diagnosis;
    }
    
    // Attempt to connect with debug information
    try {
      const apiKey = process.env.API_KEY;
      const headers = {
        'Accept': 'application/json',
        'X-Request-ID': diagnosisId
      };
      
      // Add API key if available
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      logger.debug(`Enviando petición de diagnóstico a ${url}`, {
        diagnosisId,
        method: 'GET',
        timeout: 10000
      });
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers,
        validateStatus: (status) => {
          // For diagnosis purposes, we'll handle all status codes including 530
          if (status === 530) {
            logger.warn(`Diagnóstico: Recibido código de estado 530 (posible error FTP)`, {
              diagnosisId,
              status
            });
          }
          return true; // Accept any status code for diagnostic purposes
        }
      });
      
      // Calculate response time
      diagnosis.responseTime = Date.now() - startTime;
      diagnosis.isReachable = true;
      diagnosis.statusCode = response.status;
      diagnosis.contentType = response.headers['content-type'];
      
      logger.info(`Petición de diagnóstico completada con estado ${response.status} en ${diagnosis.responseTime}ms`, {
        diagnosisId,
        status: response.status,
        contentType: diagnosis.contentType,
        responseTime: diagnosis.responseTime
      });
      
      // Special handling for status code 530
      if (response.status === 530) {
        diagnosis.recommendations.push('Status code 530 detected - this is typically an FTP authentication error. Check if the endpoint might be an FTP server instead of an HTTP API.');
        logger.warn(`Diagnóstico: Código 530 indicativo de problema de autenticación FTP`, {
          diagnosisId,
          url
        });
      }
      
      // Check response content type
      if (diagnosis.contentType && diagnosis.contentType.includes('application/json')) {
        diagnosis.responseType = 'JSON';
        
        // Check response structure for common API patterns
        if (response.data) {
          if (includeResponseData) {
            diagnosis.responseData = response.data;
          }
          
          // Check for common response structures
          if (Array.isArray(response.data)) {
            diagnosis.responseStructure = 'Respuesta de array directa (Formato de API nuevo)';
            if (response.data.length > 0) {
              diagnosis.sampleKeys = Object.keys(response.data[0]);
            }
          } else if (response.data.status === 'Success' && Array.isArray(response.data.data)) {
            diagnosis.responseStructure = 'Estándar { status, data[] } (Formato heredado)';
          } else if (response.data.success === true && response.data.data) {
            diagnosis.responseStructure = 'Estándar { success: true, data }';
          } else {
            diagnosis.responseStructure = 'Estructura JSON no estándar';
            diagnosis.recommendations.push('La estructura de respuesta de la API no coincide con los formatos esperados');
          }
        }
      } else {
        diagnosis.responseType = 'No JSON';
        diagnosis.recommendations.push('La respuesta de la API no está en formato JSON');
      }
      
      // Status code recommendations
      if (response.status !== 200) {
        if (response.status === 401 || response.status === 403) {
          diagnosis.recommendations.push('Problema de autenticación - comprobar API key');
        } else if (response.status === 404) {
          diagnosis.recommendations.push('Recurso no encontrado - comprobar ruta URL');
        } else if (response.status >= 500) {
          diagnosis.recommendations.push('Error de servidor - el servidor API podría estar experimentando problemas');
        }
      }
      
      // Response time recommendations
      if (diagnosis.responseTime > 5000) {
        diagnosis.recommendations.push('Tiempo de respuesta lento - considerar aumentar configuración de timeout');
      }
      
      // OData specific recommendations
      if (isODataUrl(url)) {
        diagnosis.isOData = true;
        
        // Check if URL already has pagination parameters
        if (!url.includes('$top=')) {
          diagnosis.recommendations.push('API OData detectada - considere usar parámetro $top=50 para limitar resultados por página');
        } else if (url.includes('$top=100') || url.includes('$top=1000')) {
          diagnosis.recommendations.push('Valor de $top demasiado alto - considere reducirlo a 50 para evitar problemas de límites del servidor');
        }
        
        if (!url.includes('$skip=')) {
          diagnosis.recommendations.push('API OData detectada - considere usar parámetro $skip para paginación');
        }
      }
    } catch (error) {
      diagnosis.isReachable = false;
      diagnosis.responseTime = Date.now() - startTime;
      
      logger.error(`Petición de diagnóstico falló tras ${diagnosis.responseTime}ms: ${error.message}`, {
        diagnosisId,
        error: error.message,
        code: error.code
      });
      
      if (axios.isAxiosError(error)) {
        diagnosis.errorCode = error.code;
        diagnosis.errorDetails = error.message;
        
        if (error.response) {
          diagnosis.statusCode = error.response.status;
          diagnosis.responseType = error.response.headers['content-type'];
          
          // Special handling for status code 530
          if (error.response.status === 530) {
            diagnosis.recommendations.push('Recibido código de estado 530 - Esto es típicamente un error de autenticación FTP. Compruebe si el endpoint podría ser un servidor FTP en lugar de una API HTTP.');
            logger.warn(`Diagnóstico: Recibido código 530 indicativo de problema con FTP`, {
              diagnosisId,
              url
            });
          }
          
          if (includeResponseData && error.response.data) {
            diagnosis.responseData = error.response.data;
          }
        }
        
        // Provide specific recommendations based on error code
        if (error.code === 'ECONNABORTED') {
          diagnosis.recommendations.push('Tiempo de espera agotado - el servidor tardó demasiado en responder');
        } else if (error.code === 'ECONNREFUSED') {
          diagnosis.recommendations.push('Conexión rechazada - el servidor podría estar caído o la URL es incorrecta');
        } else if (error.code === 'ENOTFOUND') {
          diagnosis.recommendations.push('Búsqueda DNS fallida - comprobar el hostname en la URL');
        }
      } else {
        diagnosis.errorDetails = `Error no-Axios: ${error.message}`;
      }
    }
  } catch (error) {
    diagnosis.errorDetails = `Error inesperado durante diagnóstico: ${error.message}`;
    logger.error(`Error inesperado durante diagnóstico de API:`, {
      diagnosisId,
      error: error.message,
      stack: error.stack
    });
  }
  
  // Add general recommendations if none specific were added
  if (diagnosis.recommendations.length === 0) {
    if (!diagnosis.isReachable) {
      diagnosis.recommendations.push('Endpoint API no es alcanzable - comprobar conectividad de red y URL');
    } else if (diagnosis.statusCode >= 400) {
      diagnosis.recommendations.push('API devolvió un código de estado de error');
    }
  }
  
  logger.info(`Diagnóstico de API completado para ${url}: ${diagnosis.isReachable ? 'Alcanzable' : 'No alcanzable'}, Estado: ${diagnosis.statusCode}`, {
    diagnosisId,
    isReachable: diagnosis.isReachable,
    statusCode: diagnosis.statusCode,
    responseTime: diagnosis.responseTime,
    isOData: diagnosis.isOData || false
  });
  
  return diagnosis;
};

/**
 * Get circuit breaker information for all monitored endpoints
 * @returns {Object} Circuit breaker states
 */
export const getCircuitBreakerStatus = () => {
  return circuitBreaker.getStates();
};

export default {
  fetchExternalAPI,
  getDataWithFallback,
  isApiReachable,
  diagnoseApiEndpoint,
  getCircuitBreakerStatus,
  isODataUrl,
  fetchAllPages
};