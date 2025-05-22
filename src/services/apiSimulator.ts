import { ApiResponse, SensorApiResponse } from '../types';
import { mockSensorData } from './mockData';

interface ApiRequest {
  url: string;
  method: string;
  headers: Headers;
  credentials?: RequestCredentials;
}

interface ApiLog {
  timestamp: Date;
  request: ApiRequest;
  response: any;
  error?: Error;
}

class ApiSimulator {
  private logs: ApiLog[] = [];

  private validateRequest(request: ApiRequest): void {
    const authHeader = request.headers.get('Authorization');
    const contentType = request.headers.get('Content-Type');
    const accept = request.headers.get('Accept');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new Error('Invalid or missing Basic authentication');
    }

    if (contentType !== 'application/json') {
      throw new Error('Content-Type must be application/json');
    }

    if (accept !== 'application/json') {
      throw new Error('Accept header must be application/json');
    }
  }

  async simulateRequest(request: ApiRequest): Promise<any> {
    const log: ApiLog = {
      timestamp: new Date(),
      request: {
        url: request.url,
        method: request.method,
        headers: request.headers,
        credentials: request.credentials
      },
      response: null
    };

    try {
      console.group('API Simulation');
      console.log('🔷 Request:', {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        credentials: request.credentials
      });

      // Validate request headers and authentication
      this.validateRequest(request);

      // Simulate API response based on URL
      let response;
      if (request.url === import.meta.env.VITE_API1_URL) {
        response = mockSensorData;
      } else if (request.url === import.meta.env.VITE_API2_URL) {
        response = {
          status: "Success",
          data: mockSensorData.data.map(rack => ({
            RACK_NAME: rack.NAME,
            TEMPERATURE: rack.TEMPERATURE,
            HUMIDITY: rack.HUMIDITY
          }))
        };
      }

      console.log('🔶 Response:', response);
      console.groupEnd();

      log.response = response;
      this.logs.push(log);
      
      return response;
    } catch (error) {
      log.error = error as Error;
      this.logs.push(log);
      console.error('❌ Error:', error);
      console.groupEnd();
      throw error;
    }
  }

  getLogs(): ApiLog[] {
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
  }
}

export const apiSimulator = new ApiSimulator();