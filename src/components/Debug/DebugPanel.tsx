import React, { useState, useEffect, useRef } from 'react';
import { useDebug, ApiLog } from '../../context/DebugContext';
import { X, RefreshCw, ChevronUp, ChevronDown, Clock, AlertCircle, Database, Globe, Server } from 'lucide-react';

type LogTab = 'api' | 'database' | 'system' | 'communication';

const DebugPanel: React.FC = () => {
  const { isDebugEnabled, apiLogs, clearLogs } = useDebug();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<LogTab>('api');
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [serverLogs, setServerLogs] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [communicationTest, setCommunicationTest] = useState<any>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Function to fetch system status
    const fetchSystemStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/status`);
        if (response.ok) {
          const data = await response.json();
          setSystemStatus(data);
        } else {
          console.error('Failed to fetch system status:', await response.text());
        }
      } catch (error) {
        console.error('Failed to fetch system status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Function to fetch server logs
    const fetchServerLogs = async (logType: string) => {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/logs?type=${logType}`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'Success') {
            setServerLogs(data.logs);
          } else {
            console.error('Failed to fetch server logs:', data.message);
            setServerLogs(`Error: ${data.message}`);
          }
        } else {
          console.error('Failed to fetch server logs:', await response.text());
          setServerLogs('Error fetching logs from server');
        }
      } catch (error) {
        console.error('Failed to fetch server logs:', error);
        setServerLogs(`Error: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    // Function to test communication
    const testCommunication = async () => {
      try {
        setIsTesting(true);
        const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/communication-test`);
        if (response.ok) {
          const data = await response.json();
          setCommunicationTest({
            success: true,
            data,
            timestamp: new Date(),
            responseTime: Date.now() - (data.requestTime || Date.now())
          });
        } else {
          setCommunicationTest({
            success: false,
            error: await response.text(),
            status: response.status,
            timestamp: new Date()
          });
        }
      } catch (error) {
        setCommunicationTest({
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      } finally {
        setIsTesting(false);
      }
    };

    if (isDebugEnabled && activeTab === 'system' && !isCollapsed) {
      fetchSystemStatus();
    }

    if (isDebugEnabled && activeTab === 'database' && !isCollapsed) {
      fetchServerLogs('debug');
    }
    
    if (isDebugEnabled && activeTab === 'communication' && !isCollapsed && !communicationTest) {
      testCommunication();
    }
  }, [isDebugEnabled, activeTab, isCollapsed, communicationTest]);

  if (!isDebugEnabled) return null;

  const filteredLogs = apiLogs.filter(log => 
    filter === '' || 
    log.endpoint.toLowerCase().includes(filter.toLowerCase()) ||
    log.method.toLowerCase().includes(filter.toLowerCase()) ||
    String(log.status).includes(filter)
  );

  const toggleExpand = (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 300 && status < 400) return 'text-blue-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  const refreshSystemStatus = async () => {
    if (activeTab === 'system') {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/status`);
        if (response.ok) {
          const data = await response.json();
          setSystemStatus(data);
        } else {
          console.error('Failed to fetch system status:', await response.text());
        }
      } catch (error) {
        console.error('Failed to fetch system status:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  const runCommunicationTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/communication-test`);
      if (response.ok) {
        const data = await response.json();
        setCommunicationTest({
          success: true,
          data,
          timestamp: new Date(),
          responseTime: Date.now() - (data.requestTime || Date.now())
        });
      } else {
        setCommunicationTest({
          success: false,
          error: await response.text(),
          status: response.status,
          timestamp: new Date()
        });
      }
    } catch (error) {
      setCommunicationTest({
        success: false,
        error: error.message,
        timestamp: new Date()
      });
    } finally {
      setIsTesting(false);
    }
  };

  const controlMonitoringService = async (action: string, interval?: number) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/monitoring/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, interval }),
      });
      
      if (response.ok) {
        // Refresh the system status to get updated monitoring info
        await refreshSystemStatus();
      } else {
        console.error('Failed to control monitoring service:', await response.text());
      }
    } catch (error) {
      console.error('Error controlling monitoring service:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchServerLogs = async (logType: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/logs?type=${logType}`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'Success') {
          setServerLogs(data.logs);
        } else {
          console.error('Failed to fetch server logs:', data.message);
          setServerLogs(`Error: ${data.message}`);
        }
      } else {
        console.error('Failed to fetch server logs:', await response.text());
        setServerLogs(`Error: HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch server logs:', error);
      setServerLogs(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      ref={panelRef}
      className={`fixed bottom-0 left-0 right-0 bg-gray-800 text-white ${isCollapsed ? 'h-10' : 'h-1/3'} transition-all duration-300 z-50`}
    >
      <div className="flex items-center justify-between border-b border-gray-700 p-2">
        <div className="flex items-center">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-white p-1 mr-2"
          >
            {isCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <h2 className="text-sm font-medium">Debug Console</h2>
          {activeTab === 'api' && (
            <div className="ml-2 text-xs bg-indigo-600 px-2 py-0.5 rounded-full">
              {filteredLogs.length} requests
            </div>
          )}
          
          {/* Tabs */}
          {!isCollapsed && (
            <div className="ml-6 flex space-x-1">
              <button
                onClick={() => setActiveTab('api')}
                className={`px-3 py-1 text-xs rounded ${
                  activeTab === 'api' 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Globe size={12} className="inline mr-1" />
                API
              </button>
              <button
                onClick={() => {
                  setActiveTab('database');
                  fetchServerLogs('debug');
                }}
                className={`px-3 py-1 text-xs rounded ${
                  activeTab === 'database' 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Database size={12} className="inline mr-1" />
                Server Logs
              </button>
              <button
                onClick={() => {
                  setActiveTab('system');
                  refreshSystemStatus();
                }}
                className={`px-3 py-1 text-xs rounded ${
                  activeTab === 'system' 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Server size={12} className="inline mr-1" />
                System
              </button>
              <button
                onClick={() => {
                  setActiveTab('communication');
                  runCommunicationTest();
                }}
                className={`px-3 py-1 text-xs rounded ${
                  activeTab === 'communication' 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <AlertCircle size={12} className="inline mr-1" />
                Communication
              </button>
            </div>
          )}
        </div>
        
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            {activeTab === 'api' && (
              <>
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 w-48"
                />
                <button
                  onClick={clearLogs}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded flex items-center"
                >
                  <RefreshCw size={12} className="mr-1" /> Clear
                </button>
              </>
            )}
            
            {activeTab === 'database' && (
              <div className="flex space-x-2">
                <select
                  onChange={(e) => fetchServerLogs(e.target.value)}
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                >
                  <option value="debug">Debug Log</option>
                  <option value="error">Error Log</option>
                  <option value="combined">Combined Log</option>
                  <option value="api">API Log</option>
                  <option value="http">HTTP Log</option>
                </select>
                <button
                  onClick={() => fetchServerLogs('debug')}
                  disabled={isLoading}
                  className={`text-xs ${
                    isLoading ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'
                  } px-2 py-1 rounded flex items-center`}
                >
                  <RefreshCw size={12} className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} /> 
                  Refresh
                </button>
              </div>
            )}
            
            {activeTab === 'system' && (
              <button
                onClick={refreshSystemStatus}
                disabled={isLoading}
                className={`text-xs ${
                  isLoading ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'
                } px-2 py-1 rounded flex items-center`}
              >
                <RefreshCw size={12} className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} /> 
                Refresh
              </button>
            )}
            
            {activeTab === 'communication' && (
              <button
                onClick={runCommunicationTest}
                disabled={isTesting}
                className={`text-xs ${
                  isTesting ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'
                } px-2 py-1 rounded flex items-center`}
              >
                <RefreshCw size={12} className={`mr-1 ${isTesting ? 'animate-spin' : ''}`} /> 
                Test Again
              </button>
            )}
            
            <button
              onClick={() => setIsCollapsed(true)}
              className="text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="overflow-auto h-[calc(100%-32px)]">
          {activeTab === 'api' && (
            filteredLogs.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Method</th>
                    <th className="px-4 py-2 text-left">Endpoint</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Response Time</th>
                    <th className="px-4 py-2 text-center">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr 
                        className={`border-t border-gray-700 hover:bg-gray-700 ${log.error ? 'bg-red-900 bg-opacity-20' : ''}`}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center">
                            <Clock size={12} className="mr-1 text-gray-400" />
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`font-mono px-2 py-0.5 rounded text-xs
                            ${log.method === 'GET' ? 'bg-blue-900 text-blue-200' : ''}
                            ${log.method === 'POST' ? 'bg-green-900 text-green-200' : ''}
                            ${log.method === 'PUT' ? 'bg-yellow-900 text-yellow-200' : ''}
                            ${log.method === 'DELETE' ? 'bg-red-900 text-red-200' : ''}
                          `}>
                            {log.method}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono truncate max-w-xs" title={log.endpoint}>
                          {log.endpoint}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`font-mono ${getStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-mono ${log.responseTime > 1000 ? 'text-red-400' : log.responseTime > 500 ? 'text-yellow-400' : 'text-gray-400'}`}>
                            {log.responseTime}ms
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button 
                            onClick={() => toggleExpand(log.id)}
                            className="text-gray-400 hover:text-white"
                          >
                            {expandedLogId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expandedLogId === log.id && (
                        <tr>
                          <td colSpan={6} className="bg-gray-900 p-2">
                            <div className="p-2 rounded bg-gray-800">
                              {log.error && (
                                <div className="mb-2 p-2 bg-red-900 bg-opacity-20 border border-red-800 rounded">
                                  <div className="flex items-center text-red-400 mb-1">
                                    <AlertCircle size={14} className="mr-1" />
                                    <span className="font-medium">Error</span>
                                  </div>
                                  <div className="font-mono text-red-300 text-xs whitespace-pre-wrap">
                                    {typeof log.error === 'object' 
                                      ? JSON.stringify(log.error, null, 2)
                                      : log.error
                                    }
                                  </div>
                                </div>
                              )}
                              
                              {log.requestHeaders && (
                                <div className="mb-2">
                                  <div className="text-gray-400 mb-1">Request Headers:</div>
                                  <pre className="bg-gray-900 p-2 rounded overflow-auto max-h-32 text-yellow-300 text-xs">
                                    {JSON.stringify(log.requestHeaders, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              {log.requestBody && (
                                <div className="mb-2">
                                  <div className="text-gray-400 mb-1">Request Payload:</div>
                                  <pre className="bg-gray-900 p-2 rounded overflow-auto max-h-32 text-green-300 text-xs">
                                    {JSON.stringify(log.requestBody, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              {log.responseBody && (
                                <div>
                                  <div className="text-gray-400 mb-1">Response:</div>
                                  <pre className="bg-gray-900 p-2 rounded overflow-auto max-h-32 text-blue-300 text-xs">
                                    {JSON.stringify(log.responseBody, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <p>No API requests logged yet</p>
                <p className="text-xs mt-1">Make a request to see logs here</p>
              </div>
            )
          )}

          {activeTab === 'database' && (
            <div className="p-4 text-gray-300">
              <div className="flex items-center mb-4">
                <Database size={20} className="text-indigo-400 mr-2" />
                <h3 className="text-lg font-medium">Server Logs</h3>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <RefreshCw size={24} className="animate-spin text-indigo-400" />
                  <span className="ml-2">Loading logs...</span>
                </div>
              ) : (
                <div className="bg-gray-900 p-4 rounded-lg overflow-auto max-h-[calc(100vh/3-100px)]">
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                    {serverLogs || 'No logs available. Click Refresh to load logs.'}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'system' && (
            <div className="p-4 text-gray-300">
              <div className="flex items-center mb-4">
                <Server size={20} className="text-indigo-400 mr-2" />
                <h3 className="text-lg font-medium">System Status</h3>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <RefreshCw size={24} className="animate-spin text-indigo-400" />
                  <span className="ml-2">Loading system status...</span>
                </div>
              ) : systemStatus ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 text-indigo-300">Server</h4>
                    <div className="space-y-1 text-xs">
                      <div><span className="text-gray-400">Uptime:</span> {Math.floor(systemStatus.server.uptime / 60)} minutes</div>
                      <div><span className="text-gray-400">Platform:</span> {systemStatus.server.platform}</div>
                      <div><span className="text-gray-400">Node Version:</span> {systemStatus.server.nodeVersion}</div>
                      <div><span className="text-gray-400">Memory Usage:</span> {Math.round(systemStatus.server.memoryUsage.rss / 1024 / 1024)} MB</div>
                    </div>
                  </div>

                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 text-indigo-300">Monitoring Service</h4>
                    {systemStatus.monitoring && (
                      <div className="space-y-1 text-xs">
                        <div>
                          <span className="text-gray-400">Status:</span>
                          <span className={systemStatus.monitoring.active ? 'text-green-400 ml-1' : 'text-yellow-400 ml-1'}>
                            {systemStatus.monitoring.active ? 'Running' : 'Stopped'}
                          </span>
                        </div>
                        {systemStatus.monitoring.active && (
                          <>
                            <div><span className="text-gray-400">Polling Interval:</span> {systemStatus.monitoring.interval / 1000}s</div>
                            <div><span className="text-gray-400">Last Run:</span> {systemStatus.monitoring.lastRun ? new Date(systemStatus.monitoring.lastRun).toLocaleString() : 'Never'}</div>
                            <div><span className="text-gray-400">Last Run Duration:</span> {systemStatus.monitoring.lastRunTime ? `${systemStatus.monitoring.lastRunTime}ms` : 'N/A'}</div>
                          </>
                        )}
                        <div className="pt-2 flex space-x-2">
                          {!systemStatus.monitoring.active ? (
                            <button
                              onClick={() => controlMonitoringService('start', 300000)}
                              className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded text-xs"
                            >
                              Start Monitoring
                            </button>
                          ) : (
                            <button
                              onClick={() => controlMonitoringService('stop')}
                              className="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                            >
                              Stop Monitoring
                            </button>
                          )}
                          <button
                            onClick={() => controlMonitoringService('run-now')}
                            className="bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                          >
                            Run Now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 text-indigo-300">Database</h4>
                    <div className="space-y-1 text-xs">
                      <div><span className="text-gray-400">Status:</span> 
                        <span className={systemStatus.database.connected ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
                          {systemStatus.database.connected ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                      <div><span className="text-gray-400">Server:</span> {systemStatus.database.server}</div>
                      <div><span className="text-gray-400">Database:</span> {systemStatus.database.database}</div>
                    </div>
                  </div>

                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 text-indigo-300">External APIs</h4>
                    <div className="space-y-1 text-xs">
                      <div className="mb-2">
                        <span className="text-gray-400">API1:</span> 
                        <span className={systemStatus.apis.api1.reachable ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
                          {systemStatus.apis.api1.reachable ? "Reachable" : "Unreachable"}
                        </span>
                        <div className="text-gray-500 text-xs mt-1 break-all">{systemStatus.apis.api1.url}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">API2:</span> 
                        <span className={systemStatus.apis.api2.reachable ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
                          {systemStatus.apis.api2.reachable ? "Reachable" : "Unreachable"}
                        </span>
                        <div className="text-gray-500 text-xs mt-1 break-all">{systemStatus.apis.api2.url}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 text-indigo-300">Circuit Breakers</h4>
                    <div className="space-y-1 text-xs">
                      {Object.keys(systemStatus.circuitBreakers).length > 0 ? (
                        Object.entries(systemStatus.circuitBreakers).map(([endpoint, state]: [string, any]) => (
                          <div key={endpoint} className="mb-2">
                            <div className="flex items-center">
                              <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                                state.status === 'closed' ? 'bg-green-500' : 
                                state.status === 'open' ? 'bg-red-500' : 'bg-yellow-500'
                              }`}></span>
                              <span className="font-mono text-xs truncate max-w-xs" title={endpoint}>
                                {endpoint.substring(0, 30)}...
                              </span>
                            </div>
                            <div className="text-gray-400 ml-3">
                              Status: {state.status}, Failures: {state.failures}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400">No circuit breakers active</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800 text-center">
                  <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
                  <p>Failed to fetch system status information.</p>
                  <button
                    onClick={refreshSystemStatus}
                    className="mt-2 px-3 py-1 bg-red-800 text-red-100 rounded text-xs hover:bg-red-700"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'communication' && (
            <div className="p-4 text-gray-300">
              <div className="flex items-center mb-4">
                <Globe size={20} className="text-indigo-400 mr-2" />
                <h3 className="text-lg font-medium">Communication Test</h3>
              </div>
              
              {isTesting ? (
                <div className="flex items-center justify-center p-8">
                  <RefreshCw size={24} className="animate-spin text-indigo-400" />
                  <span className="ml-2">Testing communication with backend server...</span>
                </div>
              ) : communicationTest ? (
                <div>
                  {communicationTest.success ? (
                    <div className="bg-green-900 bg-opacity-20 p-4 rounded-lg border border-green-800">
                      <div className="flex items-center text-green-400 mb-2">
                        <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
                        <span className="font-medium">Communication Successful</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <h4 className="text-xs font-medium text-gray-400 mb-1">Response Time</h4>
                          <div className="text-sm">{communicationTest.responseTime || '-'} ms</div>
                        </div>
                        
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <h4 className="text-xs font-medium text-gray-400 mb-1">Status</h4>
                          <div className="text-sm">{communicationTest.data?.status || 'Success'}</div>
                        </div>
                        
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <h4 className="text-xs font-medium text-gray-400 mb-1">Server Time</h4>
                          <div className="text-sm">{communicationTest.data?.timestamp || 'Unknown'}</div>
                        </div>
                        
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <h4 className="text-xs font-medium text-gray-400 mb-1">Server Info</h4>
                          <div className="text-sm">
                            {communicationTest.data?.serverInfo ? (
                              <>Node.js {communicationTest.data.serverInfo.nodeVersion}</>
                            ) : 'Unknown'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <h4 className="text-xs font-medium text-gray-400 mb-1">Request Headers Received by Server</h4>
                        <pre className="bg-gray-800 p-2 rounded-lg text-xs overflow-auto max-h-32">
                          {JSON.stringify(communicationTest.data?.requestHeaders || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                      <div className="flex items-center text-red-400 mb-2">
                        <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
                        <span className="font-medium">Communication Failed</span>
                      </div>
                      
                      <div className="bg-gray-800 p-3 rounded-lg mt-4">
                        <h4 className="text-xs font-medium text-gray-400 mb-1">Error</h4>
                        <div className="text-sm text-red-300">{communicationTest.error || 'Unknown error'}</div>
                      </div>
                      
                      {communicationTest.status && (
                        <div className="bg-gray-800 p-3 rounded-lg mt-2">
                          <h4 className="text-xs font-medium text-gray-400 mb-1">Status Code</h4>
                          <div className="text-sm">{communicationTest.status}</div>
                        </div>
                      )}
                      
                      <div className="mt-4">
                        <h4 className="text-xs font-medium text-gray-400">Possible Issues</h4>
                        <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                          <li>Backend server may not be running</li>
                          <li>CORS configuration might be incorrect</li>
                          <li>The server URL may be incorrect in your environment variables</li>
                          <li>Network connectivity issues</li>
                          <li>Firewall or security settings blocking the connection</li>
                        </ul>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <button
                      onClick={runCommunicationTest}
                      className="bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-2 rounded text-sm flex items-center"
                    >
                      <RefreshCw size={16} className="mr-2" />
                      Run Test Again
                    </button>
                    
                    <div className="text-xs text-gray-400 mt-2">
                      Last tested: {communicationTest.timestamp.toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No communication test has been run yet</p>
                  <button
                    onClick={runCommunicationTest}
                    className="bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-2 rounded text-sm flex items-center mx-auto"
                  >
                    <Server size={16} className="mr-2" />
                    Test Backend Communication
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugPanel;