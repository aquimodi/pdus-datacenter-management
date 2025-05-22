import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface ApiLog {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  requestBody?: any;
  requestHeaders?: Record<string, string>;
  responseBody?: any;
  responseHeaders?: Record<string, any>;
  error?: string | object;
}

interface DebugContextType {
  isDebugEnabled: boolean;
  apiLogs: ApiLog[];
  toggleDebug: () => void;
  clearLogs: () => void;
  addLog: (log: ApiLog) => void;
  getLogById: (id: string) => ApiLog | undefined;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export const DebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDebugEnabled, setIsDebugEnabled] = useState(false);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);

  const toggleDebug = () => {
    setIsDebugEnabled(prev => !prev);
  };

  const clearLogs = () => {
    setApiLogs([]);
  };

  const addLog = (log: ApiLog) => {
    setApiLogs(prev => {
      // Check if a log with this ID already exists
      const existingLogIndex = prev.findIndex(item => item.id === log.id);
      
      if (existingLogIndex >= 0) {
        // Update existing log
        const updatedLogs = [...prev];
        updatedLogs[existingLogIndex] = {
          ...prev[existingLogIndex],
          ...log
        };
        return updatedLogs;
      } else {
        // Add new log
        return [log, ...prev].slice(0, 100); // Keep only the last 100 logs
      }
    });
  };

  const getLogById = (id: string): ApiLog | undefined => {
    return apiLogs.find(log => log.id === id);
  };

  // Setup event listener for API logs coming from the server
  useEffect(() => {
    const handleApiLog = (event: CustomEvent) => {
      addLog(event.detail);
    };

    // Using a custom event name for API logs
    window.addEventListener('api-log' as any, handleApiLog);

    return () => {
      window.removeEventListener('api-log' as any, handleApiLog);
    };
  }, []);

  // For testing purposes (during development):
  // This will simulate some API logs if there are none
  useEffect(() => {
    if (isDebugEnabled && apiLogs.length === 0) {
      // Add some sample logs for testing UI
      const sampleLogs: ApiLog[] = [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          endpoint: '/api/racks',
          method: 'GET',
          status: 200,
          responseTime: 120,
          requestHeaders: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          responseBody: { status: 'Success', data: [{ id: '1', name: 'Test Rack' }] }
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          endpoint: '/api/sensors',
          method: 'GET',
          status: 200,
          responseTime: 85,
          requestHeaders: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          responseBody: { status: 'Success', data: [{ id: '1', temperature: '22.5' }] }
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 120000).toISOString(),
          endpoint: '/api/problems',
          method: 'GET',
          status: 404,
          responseTime: 45,
          requestHeaders: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          error: 'Resource not found'
        }
      ];
      
      setApiLogs(sampleLogs);
    }
  }, [isDebugEnabled, apiLogs.length]);

  return (
    <DebugContext.Provider value={{ isDebugEnabled, apiLogs, toggleDebug, clearLogs, addLog, getLogById }}>
      {children}
    </DebugContext.Provider>
  );
};

export const useDebug = (): DebugContextType => {
  const context = useContext(DebugContext);
  if (context === undefined) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
};