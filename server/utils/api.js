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
  
  logger.info(`Starting paginated data retrieval from OData API: ${baseUrl}`, {
    requestId,
    pageSize,
    initialPage: currentPage
  });

  while (hasMorePages) {
    const skip = currentPage * pageSize;
    const paginatedUrl = addODataPaginationParams(baseUrl, skip, pageSize);
    
    logger.info(`Getting page ${currentPage + 1} (skip=${skip}, top=${pageSize})`, {
      requestId,
      url: paginatedUrl,
      page: currentPage + 1
    });
    
    try {
      const startTime = Date.now();
      const response = await axios.get(paginatedUrl, requestConfig);
      const duration = Date.now() - startTime;
      
      logger.info(`Page ${currentPage + 1} retrieved in ${duration}ms with status ${response.status}`, {
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
          logger.info(`Total records according to OData metadata: ${totalRecords}`, {
            requestId
          });
        }
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        // Custom format with 'data' property
        pageData = response.data.data;
      } else {
        logger.warn(`Unknown response format on page ${currentPage + 1}`, {
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
              logger.info(`Extracted data array from "${key}" property`, {
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
      logger.info(`Progress: ${allResults.length} records obtained so far`, {
        requestId,
        page: currentPage + 1,
        pageRecords: pageData.length,
        totalRecords: allResults.length
      });
      
      // Determine if we should fetch more pages
      if (pageData.length < pageSize) {
        // We received fewer records than the page size, so we're likely at the end
        hasMorePages = false;
        logger.info(`End of pagination: last page contains fewer than ${pageSize} records`, {
          requestId,
          records: pageData.length,
          totalRecords: allResults.length
        });
      } else if (totalRecords > 0 && allResults.length >= totalRecords) {
        // We've reached the total count according to OData metadata
        hasMorePages = false;
        logger.info(`End of pagination: retrieved all ${totalRecords} records`, {
          requestId
        });
      } else if (response.data && response.data['@odata.nextLink']) {
        // OData provides a next link - we could use it but for simplicity we'll stick with skip/top
        logger.debug(`API provides nextLink for pagination`, {
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
        logger.warn(`Safety limit reached: 20 pages (${pageSize * 20} records)`, {
          requestId
        });
        hasMorePages = false;
      }
      
      // Small delay between page requests to avoid overwhelming the server
      if (hasMorePages) {
        await sleep(300); // Add a small delay between requests
      }
      
    } catch (error) {
      logger.error(`Error getting page ${currentPage + 1}: ${error.message}`, {
        requestId,
        page: currentPage + 1,
        error: error.message,
        code: error.code
      });
      
      // If we've already fetched some data, return what we have
      if (allResults.length > 0) {
        logger.warn(`Returning ${allResults.length} records obtained before the error`, {
          requestId
        });
        
        hasMorePages = false;
      } else {
        // If no data fetched at all, rethrow for the caller to handle
        throw error;
      }
    }
  }
  
  logger.info(`Completed paginated retrieval: ${allResults.length} total records`, {
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
 * @param {boolean} options.useMockOnFail - Whether to use mock data if all retries fail (default: false)
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
    useMockOnFail = false,
    useCircuitBreaker = true,
    usePagination = true,
    pageSize = 50, // Reduced page size
    debug = false,
    ...axiosOptions
  } = options;
  
  logger.info(`Starting external API request: ${source}`, {
    requestId,
    url,
    source,
    options: {
      retries,
      retryDelay,
      useMockOnFail,
      useCircuitBreaker,
      usePagination,
      pageSize,
      debug
    }
  });
  
  // Check if circuit breaker is open for this endpoint
  if (useCircuitBreaker && circuitBreaker.isOpen(url)) {
    logger.warn(`Circuit breaker open for ${url}. Skipping API call.`, {
      requestId,
      url,
      source
    });
    
    if (useMockOnFail) {
      logger.info(`Using mock data for ${source} due to open circuit breaker`, {
        requestId,
        source
      });
      return source.includes('rack') ? mockSensorData : { status: "Success", data: [] };
    }
    
    throw new Error(`Service unavailable: ${source} API is currently unavailable (circuit open)`);
  }

  logger.info(`Querying external API ${source}: ${url}`, { 
    requestId,
    timestamp: new Date().toISOString() 
  });
  
  let lastError = null;
  
  // Try the request up to 'retries' times
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Calculate exponential backoff delay: retryDelay * 2^attempt (with some randomness)
      const expBackoff = retryDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.3 * expBackoff; // Add up to 30% jitter
      const delayWithJitter = expBackoff + jitter;
      
      logger.info(`Retry ${attempt}/${retries} for API ${source} after ${Math.round(delayWithJitter)}ms`, {
        requestId,
        attempt,
        maxRetries: retries,
        delay: Math.round(delayWithJitter),
        timestamp: new Date().toISOString()
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
          return status >= 200 && status < 300;
        },
        ...axiosOptions
      };
      
      // Add API key as Bearer token if available
      if (apiKey) {
        requestConfig.headers['Authorization'] = `Bearer ${apiKey}`;
        logger.debug(`Added Bearer authorization header for ${source}`, {
          requestId
        });
      } else {
        logger.debug(`No API key found for ${source}`, {
          requestId
        });
      }

      // Log the detailed request configuration
      if (debug) {
        logger.debug(`API request configuration for ${source}:`, {
          requestId,
          url,
          method: requestConfig.method || 'GET',
          timeout: requestConfig.timeout,
          headers: {
            ...requestConfig.headers,
            Authorization: requestConfig.headers.Authorization ? '[REDACTED]' : undefined
          }
        });
      }

      // Determine if this is an OData API and if we should use pagination
      const isOData = isODataUrl(url);
      const shouldUsePagination = usePagination && isOData;
      
      if (isOData) {
        logger.info(`API detected as OData: ${url}`, { 
          requestId, 
          usePagination: shouldUsePagination
        });
      }

      logger.info(`Sending ${requestConfig.method || 'GET'} request to ${url}${shouldUsePagination ? ' (with pagination)' : ''}`, { 
        requestId,
        attempt: attempt + 1,
        maxRetries: retries + 1,
        timestamp: new Date().toISOString()
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
          
          logger.info(`Paginated request completed in ${duration}ms. Retrieved ${allPages.length} total records.`, {
            requestId,
            duration,
            recordCount: allPages.length,
            timestamp: new Date().toISOString()
          });
          
          response = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            data: allPages  // Return the combined array directly
          };
        } catch (paginationError) {
          logger.error(`Error in paginated request: ${paginationError.message}`, {
            requestId,
            error: paginationError.message,
            code: paginationError.code,
            timestamp: new Date().toISOString()
          });
          
          throw paginationError;
        }
      } else {
        // Standard non-paginated request
        const startTime = Date.now();
        logger.debug(`Starting API request to ${url}`, {
          requestId,
          startTime: startTime,
          timestamp: new Date().toISOString()
        });
        
        response = await axios.get(url, requestConfig);
        duration = Date.now() - startTime;
        
        logger.info(`Response received in ${duration}ms with status ${response.status}`, {
          requestId,
          duration,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers['content-type'],
          timestamp: new Date().toISOString()
        });
      }

      // Enhanced validation of response structure
      if (!response || !response.data) {
        logger.error(`Invalid or empty response received from ${source} API`, {
          requestId,
          response: response ? 'Empty data' : 'No response',
          timestamp: new Date().toISOString()
        });
        
        throw new Error(`Invalid or empty response received from ${source} API`);
      }

      // New API format returns an array directly, not wrapped in a status object
      if (Array.isArray(response.data)) {
        logger.info(`Data successfully retrieved from ${source} API on attempt ${attempt + 1}`, {
          requestId,
          itemCount: response.data.length,
          format: 'array',
          duration,
          timestamp: new Date().toISOString()
        });
        
        // Record success in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordSuccess(url);
        }
        
        // For new API format, structure response as if it came from the old API
        return {
          status: "Success",
          data: response.data
        };
      }
      
      // Old API format with status wrapper
      if (response.data && response.data.status === "Success") {
        logger.info(`Data successfully retrieved from ${source} API on attempt ${attempt + 1}`, {
          requestId,
          itemCount: response.data.data?.length,
          format: 'status-wrapper',
          duration,
          timestamp: new Date().toISOString()
        });
        
        // Record success in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordSuccess(url);
        }
        
        return response.data;
      } else {
        // Log the error details for debugging
        const errorMsg = `Invalid response from ${source} API: ${JSON.stringify(response.data)}`;
        logger.error(errorMsg, {
          requestId,
          responseData: response.data,
          timestamp: new Date().toISOString()
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
      
      // Log API call failure
      logger.error(`API call failed: ${error.message}`, {
        requestId,
        url,
        error: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText
        } : null,
        timestamp: new Date().toISOString()
      });

      // Log detailed error information
      if (axios.isAxiosError(error)) {
        logger.error(`Error retrieving data from ${source} API (attempt ${attempt + 1}/${retries + 1}):`, {
          requestId,
          message: error.message,
          code: error.code,
          status: error.response?.status,
          config: error.config ? {
            url: error.config.url,
            method: error.config.method,
            timeout: error.config.timeout,
            headers: error.config.headers ? 
              {...error.config.headers, Authorization: error.config.headers.Authorization ? '[REDACTED]' : undefined} :
              undefined
          } : 'No config available',
          timestamp: new Date().toISOString()
        });

        // Enhanced error logging for common issues
        if (error.code === 'ECONNABORTED') {
          logger.error(`Timeout (${error.config?.timeout}ms) exceeded for ${source} API`, {
            requestId,
            timeout: error.config?.timeout,
            timestamp: new Date().toISOString()
          });
        } else if (error.code === 'ECONNREFUSED') {
          logger.error(`Connection refused to ${source} API. Server might be down or unreachable.`, {
            requestId,
            url,
            timestamp: new Date().toISOString()
          });
        } else if (error.response && error.response.status === 401) {
          logger.error(`Authentication failed for ${source} API. Check API key.`, {
            requestId,
            timestamp: new Date().toISOString()
          });
        } else if (error.response && error.response.status === 403) {
          logger.error(`Access forbidden to ${source} API. Check permissions.`, {
            requestId,
            timestamp: new Date().toISOString()
          });
        }
        
        // Record failure in circuit breaker
        if (useCircuitBreaker) {
          circuitBreaker.recordFailure(url);
        }
      } else {
        logger.error(`Non-Axios error retrieving data from ${source} API (attempt ${attempt + 1}/${retries + 1}):`, {
          requestId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
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
  
  // If we've exhausted all retries, use mock data or throw the last error
  logger.error(`Failed to retrieve data from ${source} API after ${retries + 1} attempts`, {
    requestId,
    error: lastError?.message,
    timestamp: new Date().toISOString()
  });
  
  if (useMockOnFail) {
    logger.warn(`Falling back to mock data for ${source}`, { 
      requestId,
      timestamp: new Date().toISOString()
    });
    return source.includes('rack') ? mockSensorData : { status: "Success", data: [] };
  }
  
  throw lastError || new Error(`Failed to retrieve data from ${source} API after ${retries + 1} attempts`);
};

/**
 * Attempts to get data from database first, falls back to external API if DB fails
 * @param {Function} dbFunction - Function to get data from database
 * @param {string} apiUrl - External API URL for fallback
 * @param {string} source - Description of the data source (for logging)
 * @param {Object} options - Additional options for API requests
 * @returns {Promise<Array>} The data array
 */
export const getDataWithFallback = async (dbFunction, apiUrl, source, options = {}) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  logger.info(`Starting data retrieval for ${source} with fallback options`, {
    requestId,
    source,
    apiUrl,
    timestamp: new Date().toISOString()
  });
  
  // First, try to get data from database
  try {
    logger.info(`[${requestId}] Attempting to get ${source} from database`, {
      requestId,
      source,
      method: 'database',
      timestamp: new Date().toISOString()
    });
    
    const startTime = Date.now();
    const data = await dbFunction();
    const duration = Date.now() - startTime;
    
    logger.info(`[${requestId}] Database query completed in ${duration}ms`, {
      requestId,
      duration,
      dataFound: data && data.length > 0,
      timestamp: new Date().toISOString()
    });
    
    if (data && Array.isArray(data) && data.length > 0) {
      logger.info(`[${requestId}] Retrieved ${data.length} ${source} records from database`, {
        requestId,
        itemCount: data.length,
        source,
        method: 'database',
        duration,
        timestamp: new Date().toISOString()
      });
      
      return data;
    } else {
      // If database returned empty data, log a warning and try API
      logger.warn(`[${requestId}] Database returned empty result for ${source}. Trying external API.`, {
        requestId,
        source,
        timestamp: new Date().toISOString()
      });
    }
  } catch (dbError) {
    // Log the database error
    logger.warn(`[${requestId}] Database access failed for ${source}: ${dbError.message}. Trying external API.`, {
      requestId,
      error: dbError.message,
      code: dbError.code,
      source,
      timestamp: new Date().toISOString()
    });
  }
  
  // If database access fails or returns empty data, try to fetch from external API
  try {
    logger.info(`[${requestId}] Falling back to external API for ${source}`, {
      requestId,
      apiUrl,
      source,
      timestamp: new Date().toISOString()
    });
    
    // Check if this is an OData API that needs pagination
    const needsPagination = isODataUrl(apiUrl);
    
    logger.info(`[${requestId}] API type: ${needsPagination ? 'OData with pagination' : 'Standard API'}`, {
      requestId,
      apiUrl,
      usePagination: needsPagination,
      timestamp: new Date().toISOString()
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
    
    logger.info(`[${requestId}] API request completed in ${duration}ms`, {
      requestId,
      duration,
      responseReceived: !!apiResponse,
      timestamp: new Date().toISOString()
    });
    
    // Handle both old and new API formats
    if (apiResponse && apiResponse.status === "Success" && apiResponse.data && Array.isArray(apiResponse.data)) {
      // Old API format with status wrapper
      logger.info(`[${requestId}] Retrieved ${apiResponse.data.length} ${source} records from external API (old format)`, {
        requestId,
        itemCount: apiResponse.data.length,
        source,
        method: 'api-old-format',
        duration,
        timestamp: new Date().toISOString()
      });
      
      return apiResponse.data;
    } else if (apiResponse && Array.isArray(apiResponse)) {
      // New API format returns array directly
      logger.info(`[${requestId}] Retrieved ${apiResponse.length} ${source} records from external API (new format)`, {
        requestId,
        itemCount: apiResponse.length,
        source,
        method: 'api-new-format',
        duration,
        timestamp: new Date().toISOString()
      });
      
      return apiResponse;
    } else {
      logger.warn(`[${requestId}] External API returned invalid or empty data for ${source}`, {
        requestId,
        source,
        timestamp: new Date().toISOString()
      });
      
      // Check if we should use mock data
      if (options.useMockOnFail) {
        logger.warn(`[${requestId}] Using mock data for ${source}`, { 
          requestId, 
          source,
          timestamp: new Date().toISOString()
        });
        return source.includes('rack') ? mockSensorData.data : [];
      } else {
        logger.warn(`[${requestId}] Returning empty array for ${source}`, {
          requestId,
          source,
          timestamp: new Date().toISOString()
        });
        return [];
      }
    }
  } catch (apiError) {
    logger.error(`[${requestId}] Both database access and API failed for ${source}`, {
      requestId,
      dbError: 'See previous logs',
      apiError: apiError.message,
      source,
      timestamp: new Date().toISOString()
    });
    
    // Use mock data if specified
    if (options.useMockOnFail) {
      logger.warn(`[${requestId}] Using mock data for ${source} after all methods failed`, {
        requestId,
        source,
        timestamp: new Date().toISOString()
      });
      return source.includes('rack') ? mockSensorData.data : [];
    } else {
      // Return empty array instead of using mock data
      logger.warn(`[${requestId}] Returning empty array for ${source} after all methods failed`, {
        requestId,
        source,
        timestamp: new Date().toISOString()
      });
      return [];
    }
  }
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
    logger.debug(`Cannot check reachability: No URL provided`, { 
      requestId,
      timestamp: new Date().toISOString()
    });
    return false;
  }
  
  logger.info(`Checking if API at ${url} is reachable`, { 
    requestId, 
    url,
    timestamp: new Date().toISOString()
  });
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
    
    logger.debug(`Attempting HEAD request to ${url}`, { 
      requestId, 
      method: 'HEAD',
      timeout: options.timeout || 5000,
      timestamp: new Date().toISOString()
    });
    
    // First try a HEAD request as it's more efficient
    const response = await axios.head(url, {
      headers,
      timeout: 5000,
      validateStatus: null // Don't throw on error status codes
    });
    
    const duration = Date.now() - startTime;
    logger.info(`API at ${url} is reachable (HEAD request, status: ${response.status})`, { 
      requestId, 
      duration: `${duration}ms`,
      status: response.status,
      timestamp: new Date().toISOString()
    });
    
    return true;
  } catch (headError) {
    logger.debug(`HEAD request to ${url} failed: ${headError.message}. Trying GET as alternative.`, {
      requestId,
      error: headError.message,
      code: headError.code,
      timestamp: new Date().toISOString()
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
      
      logger.debug(`Attempting GET request to ${url}`, { 
        requestId, 
        method: 'GET',
        timeout: options.timeout || 5000,
        timestamp: new Date().toISOString()
      });
      
      const response = await axios.get(url, {
        headers,
        timeout: 5000,
        validateStatus: null // Don't throw on error status codes
      });
      
      const duration = Date.now() - startTime;
      logger.info(`API at ${url} is reachable (GET request, status: ${response.status})`, { 
        requestId, 
        duration: `${duration}ms`,
        status: response.status,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`API at ${url} is not reachable: ${error.message}`, {
        requestId,
        duration: `${duration}ms`,
        error: error.message,
        code: error.code,
        config: error.config ? {
          url: error.config.url,
          method: error.config.method,
          timeout: error.config.timeout
        } : 'No config available',
        timestamp: new Date().toISOString()
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
  logger.info(`Diagnosing API endpoint for ${url}`, { 
    diagnosisId, 
    url,
    timestamp: new Date().toISOString()
  });
  
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
      diagnosis.errorDetails = 'No URL provided';
      diagnosis.recommendations.push('Provide a valid URL for diagnosis');
      
      logger.error(`Diagnosis failed: No URL provided`, { 
        diagnosisId,
        timestamp: new Date().toISOString()
      });
      return diagnosis;
    }
    
    // Try to validate the URL format
    try {
      new URL(url);
    } catch (urlError) {
      diagnosis.errorDetails = 'Invalid URL format';
      diagnosis.recommendations.push('Check URL format (should be like http://example.com/api/path)');
      
      logger.error(`Diagnosis failed: Invalid URL format - ${url}`, { 
        diagnosisId,
        error: urlError.message,
        timestamp: new Date().toISOString()
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
      
      logger.debug(`Sending diagnosis request to ${url}`, {
        diagnosisId,
        method: 'GET',
        timeout: 10000,
        timestamp: new Date().toISOString()
      });
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers,
        validateStatus: () => true // Accept any status code for diagnostic purposes
      });
      
      // Calculate response time
      diagnosis.responseTime = Date.now() - startTime;
      diagnosis.isReachable = true;
      diagnosis.statusCode = response.status;
      diagnosis.contentType = response.headers['content-type'];
      
      logger.info(`Diagnosis request completed with status ${response.status} in ${diagnosis.responseTime}ms`, {
        diagnosisId,
        status: response.status,
        contentType: diagnosis.contentType,
        responseTime: diagnosis.responseTime,
        timestamp: new Date().toISOString()
      });
      
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
            diagnosis.responseStructure = 'Direct array response (New API format)';
            if (response.data.length > 0) {
              diagnosis.sampleKeys = Object.keys(response.data[0]);
            }
          } else if (response.data.status === 'Success' && Array.isArray(response.data.data)) {
            diagnosis.responseStructure = 'Standard { status, data[] } (Legacy format)';
          } else if (response.data.success === true && response.data.data) {
            diagnosis.responseStructure = 'Standard { success: true, data }';
          } else {
            diagnosis.responseStructure = 'Non-standard JSON structure';
            diagnosis.recommendations.push('The API response structure does not match expected formats');
          }
        }
      } else {
        diagnosis.responseType = 'Not JSON';
        diagnosis.recommendations.push('The API response is not in JSON format');
      }
      
      // Status code recommendations
      if (response.status !== 200) {
        if (response.status === 401 || response.status === 403) {
          diagnosis.recommendations.push('Authentication issue - check API key');
        } else if (response.status === 404) {
          diagnosis.recommendations.push('Resource not found - check URL path');
        } else if (response.status >= 500) {
          diagnosis.recommendations.push('Server error - the API server might be experiencing problems');
        }
      }
      
      // Response time recommendations
      if (diagnosis.responseTime > 5000) {
        diagnosis.recommendations.push('Slow response time - consider increasing timeout configuration');
      }
      
      // OData specific recommendations
      if (isODataUrl(url)) {
        diagnosis.isOData = true;
        
        // Check if URL already has pagination parameters
        if (!url.includes('$top=')) {
          diagnosis.recommendations.push('OData API detected - consider using $top=50 parameter to limit results per page');
        } else if (url.includes('$top=100') || url.includes('$top=1000')) {
          diagnosis.recommendations.push('$top value too high - consider reducing to 50 to avoid server limit issues');
        }
        
        if (!url.includes('$skip=')) {
          diagnosis.recommendations.push('OData API detected - consider using $skip parameter for pagination');
        }
      }
    } catch (error) {
      diagnosis.isReachable = false;
      diagnosis.responseTime = Date.now() - startTime;
      
      logger.error(`Diagnosis request failed after ${diagnosis.responseTime}ms: ${error.message}`, {
        diagnosisId,
        error: error.message,
        code: error.code,
        config: error.config ? {
          url: error.config.url,
          method: error.config.method,
          timeout: error.config.timeout,
          headers: error.config.headers ? {
            ...error.config.headers, 
            Authorization: error.config.headers.Authorization ? '[REDACTED]' : undefined
          } : 'No headers available'
        } : 'No config available',
        timestamp: new Date().toISOString()
      });
      
      if (axios.isAxiosError(error)) {
        diagnosis.errorCode = error.code;
        diagnosis.errorDetails = error.message;
        
        if (error.response) {
          diagnosis.statusCode = error.response.status;
          diagnosis.responseType = error.response.headers['content-type'];
          
          if (includeResponseData && error.response.data) {
            diagnosis.responseData = error.response.data;
          }
        }
        
        // Provide specific recommendations based on error code
        if (error.code === 'ECONNABORTED') {
          diagnosis.recommendations.push('Timeout - the server took too long to respond');
        } else if (error.code === 'ECONNREFUSED') {
          diagnosis.recommendations.push('Connection refused - the server might be down or the URL is incorrect');
        } else if (error.code === 'ENOTFOUND') {
          diagnosis.recommendations.push('DNS lookup failed - check the hostname in the URL');
        }
      } else {
        diagnosis.errorDetails = `Non-Axios error: ${error.message}`;
      }
    }
  } catch (error) {
    diagnosis.errorDetails = `Unexpected error during diagnosis: ${error.message}`;
    logger.error(`Unexpected error during API diagnosis:`, {
      diagnosisId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
  
  // Add general recommendations if none specific were added
  if (diagnosis.recommendations.length === 0) {
    if (!diagnosis.isReachable) {
      diagnosis.recommendations.push('API endpoint is not reachable - check network connectivity and URL');
    } else if (diagnosis.statusCode >= 400) {
      diagnosis.recommendations.push('API returned an error status code');
    }
  }
  
  logger.info(`API diagnosis completed for ${url}: ${diagnosis.isReachable ? 'Reachable' : 'Not reachable'}, Status: ${diagnosis.statusCode}`, {
    diagnosisId,
    isReachable: diagnosis.isReachable,
    statusCode: diagnosis.statusCode,
    responseTime: diagnosis.responseTime,
    isOData: diagnosis.isOData || false,
    timestamp: new Date().toISOString()
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