import React, { useState, useEffect } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { routeRequest } from '../api/route';
import { RefreshCw, Server, Database, Globe, AlertCircle, Check, X, Clock, Activity, BarChart2, Terminal, Play, Square, ChevronDown, ChevronUp, ExternalLink, Download } from 'lucide-react';

// Define interfaces for monitoring data
interface MonitoringStatus {
  active: boolean;
  interval: number;
  lastRun: string | null;
  lastRunTime: number | null;
  api1Reachable: boolean;
  api2Reachable: boolean;
  cyclesCompleted?: number;
  problemsDetected?: number;
}

interface ApiStatus {
  api1: {
    url: string;
    reachable: boolean;
  };
  api2: {
    url: string;
    reachable: boolean;
  };
}

interface DatabaseStatus {
  connected: boolean;
  server: string;
  database: string;
}

interface SystemStatus {
  timestamp: string;
  duration: string;
  database: DatabaseStatus;
  apis: ApiStatus;
  monitoring: MonitoringStatus;
  circuitBreakers: Record<string, any>;
  server: {
    uptime: number;
    memoryUsage: Record<string, any>;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  context?: string;
}

const ServerPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'status' | 'monitoring' | 'performance' | 'logs'>('monitoring');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [monitoringLogs, setMonitoringLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customInterval, setCustomInterval] = useState<number>(300);
  const [detailedView, setDetailedView] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<{type: 'success' | 'error'; message: string} | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());

  // Only Admins and Managers can access this page
  if (user?.role === 'Operator') {
    return <Navigate to="/dashboard" replace />;
  }

  // Fetch system status on component mount
  useEffect(() => {
    fetchSystemStatus();
    
    // Set up polling for status
    const intervalId = setInterval(() => {
      fetchSystemStatus();
    }, 30000); // Poll every 30 seconds
    
    return () => clearInterval(intervalId);
  }, []);

  // Fetch monitoring logs on tab change
  useEffect(() => {
    if (activeTab === 'logs') {
      fetchMonitoringLogs();
    }
  }, [activeTab]);

  const fetchSystemStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/status`);
      const data = await response.json();
      setSystemStatus(data);
      setLastUpdated(new Date());
      if (data.monitoring && data.monitoring.interval) {
        setCustomInterval(data.monitoring.interval / 1000);
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      setAlertMessage({ 
        type: 'error', 
        message: 'Error al obtener estado del sistema: ' + (error instanceof Error ? error.message : 'Error desconocido') 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMonitoringLogs = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/logs?type=combined&lines=100`);
      const data = await response.json();
      if (data.status === 'Success' && data.logs) {
        // Parse log entries and filter for monitoring-related logs
        const logs = data.logs
          .split('\n')
          .filter(line => line.includes('monitoring') || line.includes('Monitoring'))
          .map((line, index) => {
            // Try to parse JSON logs
            try {
              const logObject = JSON.parse(line);
              return {
                timestamp: logObject.timestamp || new Date().toISOString(),
                message: logObject.message || line,
                level: logObject.level || 'info',
                context: JSON.stringify(
                  Object.entries(logObject)
                    .filter(([key]) => !['timestamp', 'message', 'level'].includes(key))
                    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
                )
              };
            } catch {
              // If not JSON, try to extract info from plain text
              const timestampMatch = line.match(/\[(.*?)\]/);
              const levelMatch = line.match(/\[([A-Z]+)\]/);
              
              return {
                timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                message: line,
                level: (levelMatch ? levelMatch[1].toLowerCase() : 'info') as 'info' | 'error' | 'warn' | 'debug',
                context: ''
              };
            }
          });
          
        setMonitoringLogs(logs);
      }
    } catch (error) {
      console.error('Failed to fetch monitoring logs:', error);
      setAlertMessage({ 
        type: 'error', 
        message: 'Error al obtener logs de monitorización' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const controlMonitoring = async (action: 'start' | 'stop' | 'run-now') => {
    setIsLoading(true);
    try {
      let endpoint;
      let body = {};
      
      switch (action) {
        case 'start':
          endpoint = '/api/monitoring/start';
          body = { interval: customInterval * 1000 };
          break;
        case 'stop':
          endpoint = '/api/monitoring/stop';
          break;
        case 'run-now':
          endpoint = '/api/monitoring/run-now';
          break;
      }
      
      await routeRequest({
        destination: `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}${endpoint}`,
        method: 'POST',
        body
      });
      
      // Show success message
      setAlertMessage({
        type: 'success',
        message: action === 'start' 
          ? 'Servicio de monitorización iniciado'
          : action === 'stop'
            ? 'Servicio de monitorización detenido'
            : 'Ciclo de monitorización ejecutado manualmente'
      });
      
      // Refresh status after action
      await fetchSystemStatus();
      
      if (action === 'run-now') {
        // For run-now, also refresh logs
        setTimeout(() => fetchMonitoringLogs(), 2000);
      }
    } catch (error) {
      console.error(`Failed to ${action} monitoring service:`, error);
      setAlertMessage({
        type: 'error',
        message: `Error al ${action === 'start' ? 'iniciar' : action === 'stop' ? 'detener' : 'ejecutar'} el servicio de monitorización`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadLogs = () => {
    const logText = monitoringLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message} ${log.context}`)
      .join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monitoring-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return [
      hours > 0 ? `${hours}h` : '',
      minutes > 0 ? `${minutes}m` : '',
      `${remainingSeconds}s`
    ].filter(Boolean).join(' ');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <MainLayout
      title="Administración del Servidor"
      lastUpdated={lastUpdated}
      loading={isLoading}
      onRefresh={fetchSystemStatus}
      isAutoRefresh={false}
      toggleAutoRefresh={() => {}}
    >
      {/* Alert message */}
      {alertMessage && (
        <div className={`mb-4 p-4 rounded-md ${alertMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'} relative`}>
          {alertMessage.type === 'success' ? 
            <Check size={18} className="inline-block mr-2" /> : 
            <AlertCircle size={18} className="inline-block mr-2" />
          }
          {alertMessage.message}
          <button 
            className="absolute top-4 right-4" 
            onClick={() => setAlertMessage(null)}>
            <X size={18} />
          </button>
        </div>
      )}
      
      {/* Status panel container */}
      <div className="bg-white rounded-lg shadow-md">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex px-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`py-3 px-4 ${
                activeTab === 'monitoring'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Server size={16} className="inline-block mr-1.5" />
              Monitorización
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`py-3 px-4 ${
                activeTab === 'status'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Activity size={16} className="inline-block mr-1.5" />
              Estado del Sistema
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={`py-3 px-4 ${
                activeTab === 'performance'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart2 size={16} className="inline-block mr-1.5" />
              Rendimiento
            </button>
            <button
              onClick={() => {
                setActiveTab('logs');
                fetchMonitoringLogs();
              }}
              className={`py-3 px-4 ${
                activeTab === 'logs'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Terminal size={16} className="inline-block mr-1.5" />
              Logs
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
              <RefreshCw size={24} className="animate-spin text-indigo-600" />
            </div>
          )}
          
          {/* Monitoring Tab */}
          {activeTab === 'monitoring' && systemStatus && (
            <div className="space-y-6">
              {/* Service Status Card */}
              <div className="bg-white p-6 border rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-800">Estado del Servicio de Monitorización</h3>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    systemStatus.monitoring.active ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 ${
                        systemStatus.monitoring.active ? 'bg-green-500' : 'bg-yellow-500'
                      }`}></div>
                      {systemStatus.monitoring.active ? 'Activo' : 'Inactivo'}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Configuración</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-gray-500">Intervalo de ejecución:</span>
                        <div className="flex items-center mt-1">
                          <input
                            type="number"
                            min="10"
                            max="3600"
                            value={customInterval}
                            onChange={(e) => setCustomInterval(Number(e.target.value))}
                            className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            disabled={systemStatus.monitoring.active}
                          />
                          <span className="ml-2 text-gray-500">segundos</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex space-x-4">
                      {!systemStatus.monitoring.active ? (
                        <button
                          onClick={() => controlMonitoring('start')}
                          className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm flex items-center"
                        >
                          <Play size={16} className="mr-1" />
                          Iniciar Monitorización
                        </button>
                      ) : (
                        <button
                          onClick={() => controlMonitoring('stop')}
                          className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-sm flex items-center"
                        >
                          <Square size={16} className="mr-1" />
                          Detener Monitorización
                        </button>
                      )}
                      <button
                        onClick={() => controlMonitoring('run-now')}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm flex items-center"
                      >
                        <RefreshCw size={16} className="mr-1" />
                        Ejecutar Ahora
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Estado de APIs</h4>
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 text-sm">API Racks:</span>
                          <span className={`flex items-center ${systemStatus.apis.api1.reachable ? 'text-green-600' : 'text-red-500'}`}>
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${systemStatus.apis.api1.reachable ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {systemStatus.apis.api1.reachable ? 'Conectado' : 'Desconectado'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500 truncate" title={systemStatus.apis.api1.url}>
                          {systemStatus.apis.api1.url}
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 text-sm">API Sensores:</span>
                          <span className={`flex items-center ${systemStatus.apis.api2.reachable ? 'text-green-600' : 'text-red-500'}`}>
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${systemStatus.apis.api2.reachable ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {systemStatus.apis.api2.reachable ? 'Conectado' : 'Desconectado'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500 truncate" title={systemStatus.apis.api2.url}>
                          {systemStatus.apis.api2.url}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Base de Datos</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 text-sm">Estado:</span>
                        <span className={`flex items-center ${systemStatus.database.connected ? 'text-green-600' : 'text-red-500'}`}>
                          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${systemStatus.database.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {systemStatus.database.connected ? 'Conectado' : 'Desconectado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Servidor:</span>
                        <div className="mt-1 text-sm text-gray-900">
                          {systemStatus.database.server || 'No disponible'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Base de Datos:</span>
                        <div className="mt-1 text-sm text-gray-900">
                          {systemStatus.database.database || 'No disponible'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Last Run Information */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Última Ejecución</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-xs text-gray-500">Fecha y Hora</div>
                      <div className="mt-1 text-sm font-medium">
                        {systemStatus.monitoring.lastRun ? 
                          new Date(systemStatus.monitoring.lastRun).toLocaleString() : 
                          'Nunca ejecutado'}
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-xs text-gray-500">Duración</div>
                      <div className="mt-1 text-sm font-medium">
                        {systemStatus.monitoring.lastRunTime ? 
                          `${systemStatus.monitoring.lastRunTime}ms` : 
                          'N/A'}
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-xs text-gray-500">Próxima Ejecución</div>
                      <div className="mt-1 text-sm font-medium">
                        {systemStatus.monitoring.active && systemStatus.monitoring.lastRun ? 
                          new Date(new Date(systemStatus.monitoring.lastRun).getTime() + 
                                  systemStatus.monitoring.interval).toLocaleString() : 
                          'No programado'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Detailed Information */}
              <div className="bg-white p-6 border rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-800">Información Detallada</h3>
                  <button 
                    onClick={() => setDetailedView(!detailedView)}
                    className="text-indigo-600 hover:text-indigo-700 flex items-center text-sm"
                  >
                    {detailedView ? (
                      <>
                        <ChevronUp size={16} className="mr-1" />
                        Ocultar Detalles
                      </>
                    ) : (
                      <>
                        <ChevronDown size={16} className="mr-1" />
                        Mostrar Detalles
                      </>
                    )}
                  </button>
                </div>
                
                {detailedView && (
                  <div className="space-y-4">
                    {/* Circuit Breakers */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Circuit Breakers</h4>
                      {Object.keys(systemStatus.circuitBreakers).length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endpoint</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fallos</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último Fallo</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Próximo Reintento</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {Object.entries(systemStatus.circuitBreakers).map(([endpoint, state]: [string, any]) => (
                                <tr key={endpoint}>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 truncate" style={{maxWidth: '250px'}} title={endpoint}>
                                    {endpoint}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                      state.status === 'closed' 
                                        ? 'bg-green-100 text-green-800' 
                                        : state.status === 'open' 
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {state.status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{state.failures}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                                    {state.lastFailure ? new Date(state.lastFailure).toLocaleString() : 'N/A'}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                                    {state.nextTry ? new Date(state.nextTry).toLocaleString() : 'N/A'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-500">
                          No hay circuit breakers activos
                        </div>
                      )}
                    </div>
                    
                    {/* Server Stats */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Estadísticas del Servidor</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-500">Tiempo Activo</div>
                          <div className="mt-1 text-sm font-medium">
                            {formatDuration(systemStatus.server.uptime)}
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-500">Uso de Memoria</div>
                          <div className="mt-1 text-sm font-medium">
                            {formatBytes(systemStatus.server.memoryUsage.rss)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Heap: {formatBytes(systemStatus.server.memoryUsage.heapTotal)} / {formatBytes(systemStatus.server.memoryUsage.heapUsed)}
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-500">Plataforma</div>
                          <div className="mt-1 text-sm font-medium">
                            {systemStatus.server.platform} ({systemStatus.server.arch})
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Node.js {systemStatus.server.nodeVersion}
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-500">Duración de Último Chequeo</div>
                          <div className="mt-1 text-sm font-medium">
                            {systemStatus.duration}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(systemStatus.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Links to other sections */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <a 
                  onClick={() => setActiveTab('status')} 
                  className="bg-blue-50 p-4 rounded-lg border border-blue-100 hover:bg-blue-100 transition cursor-pointer"
                >
                  <h4 className="text-blue-700 text-sm font-medium flex items-center">
                    <Activity size={18} className="mr-2" />
                    Ver estado completo del sistema
                  </h4>
                  <p className="text-blue-600 text-xs mt-1">
                    Revisa el estado general del server y sus componentes
                  </p>
                </a>
                
                <a 
                  onClick={() => setActiveTab('performance')} 
                  className="bg-purple-50 p-4 rounded-lg border border-purple-100 hover:bg-purple-100 transition cursor-pointer"
                >
                  <h4 className="text-purple-700 text-sm font-medium flex items-center">
                    <BarChart2 size={18} className="mr-2" />
                    Rendimiento del sistema
                  </h4>
                  <p className="text-purple-600 text-xs mt-1">
                    Monitorea el uso de recursos y métricas de rendimiento
                  </p>
                </a>
                
                <a 
                  onClick={() => {
                    setActiveTab('logs');
                    fetchMonitoringLogs();
                  }} 
                  className="bg-green-50 p-4 rounded-lg border border-green-100 hover:bg-green-100 transition cursor-pointer"
                >
                  <h4 className="text-green-700 text-sm font-medium flex items-center">
                    <Terminal size={18} className="mr-2" />
                    Ver logs del sistema
                  </h4>
                  <p className="text-green-600 text-xs mt-1">
                    Accede a los logs del servidor para diagnóstico
                  </p>
                </a>
              </div>
            </div>
          )}
          
          {/* System Status Tab */}
          {activeTab === 'status' && systemStatus && (
            <div className="space-y-6">
              <div className="bg-white p-6 border rounded-lg shadow-sm">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Estado del Sistema</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Server Status */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center mb-3">
                      <Server size={20} className="text-indigo-600 mr-2" />
                      <h4 className="font-medium text-gray-700">Servidor</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-gray-500">Tiempo Activo:</span>
                        <div className="mt-1 text-gray-800">{formatDuration(systemStatus.server.uptime)}</div>
                      </div>
                      
                      <div>
                        <span className="text-sm text-gray-500">Plataforma:</span>
                        <div className="mt-1 text-gray-800">{systemStatus.server.platform} ({systemStatus.server.arch})</div>
                      </div>
                      
                      <div>
                        <span className="text-sm text-gray-500">Versión Node.js:</span>
                        <div className="mt-1 text-gray-800">{systemStatus.server.nodeVersion}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Database Status */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center mb-3">
                      <Database size={20} className="text-indigo-600 mr-2" />
                      <h4 className="font-medium text-gray-700">Base de Datos</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-gray-500">Estado:</span>
                        <div className="mt-1 flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${
                            systemStatus.database.connected ? 'bg-green-500' : 'bg-red-500'
                          }`}></div>
                          <span className={`${
                            systemStatus.database.connected ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {systemStatus.database.connected ? 'Conectado' : 'Desconectado'}
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-sm text-gray-500">Servidor:</span>
                        <div className="mt-1 text-gray-800">{systemStatus.database.server}</div>
                      </div>
                      
                      <div>
                        <span className="text-sm text-gray-500">Base de Datos:</span>
                        <div className="mt-1 text-gray-800">{systemStatus.database.database}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* External APIs */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center mb-3">
                      <Globe size={20} className="text-indigo-600 mr-2" />
                      <h4 className="font-medium text-gray-700">APIs Externas</h4>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">API Racks:</span>
                          <span className={`flex items-center ${
                            systemStatus.apis.api1.reachable ? 'text-green-600' : 'text-red-600'
                          }`}>
                            <div className={`w-2 h-2 rounded-full mr-1 ${
                              systemStatus.apis.api1.reachable ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                            {systemStatus.apis.api1.reachable ? 'Alcanzable' : 'No Alcanzable'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700 truncate">
                          {systemStatus.apis.api1.url}
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">API Sensores:</span>
                          <span className={`flex items-center ${
                            systemStatus.apis.api2.reachable ? 'text-green-600' : 'text-red-600'
                          }`}>
                            <div className={`w-2 h-2 rounded-full mr-1 ${
                              systemStatus.apis.api2.reachable ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                            {systemStatus.apis.api2.reachable ? 'Alcanzable' : 'No Alcanzable'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700 truncate">
                          {systemStatus.apis.api2.url}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Monitoring Service */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center mb-3">
                      <Activity size={20} className="text-indigo-600 mr-2" />
                      <h4 className="font-medium text-gray-700">Servicio de Monitorización</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-gray-500">Estado:</span>
                        <div className="mt-1 flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${
                            systemStatus.monitoring.active ? 'bg-green-500' : 'bg-yellow-500'
                          }`}></div>
                          <span className={`${
                            systemStatus.monitoring.active ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            {systemStatus.monitoring.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-sm text-gray-500">Intervalo:</span>
                        <div className="mt-1 text-gray-800">{systemStatus.monitoring.interval ? `${systemStatus.monitoring.interval / 1000} segundos` : 'No configurado'}</div>
                      </div>
                      
                      <div>
                        <span className="text-sm text-gray-500">Última Ejecución:</span>
                        <div className="mt-1 text-gray-800">
                          {systemStatus.monitoring.lastRun ? 
                            new Date(systemStatus.monitoring.lastRun).toLocaleString() : 
                            'Nunca ejecutado'}
                        </div>
                      </div>
                      
                      <div className="pt-2">
                        {!systemStatus.monitoring.active ? (
                          <button
                            onClick={() => controlMonitoring('start')}
                            className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm flex items-center"
                          >
                            <Play size={16} className="mr-1" />
                            Iniciar
                          </button>
                        ) : (
                          <button
                            onClick={() => controlMonitoring('stop')}
                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-sm flex items-center"
                          >
                            <Square size={16} className="mr-1" />
                            Detener
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Performance Tab */}
          {activeTab === 'performance' && systemStatus && (
            <div className="space-y-6">
              <div className="bg-white p-6 border rounded-lg shadow-sm">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Rendimiento del Servidor</h3>
                
                {/* Memory Usage */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Uso de Memoria</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Memoria RSS</span>
                        <span className="text-sm font-medium text-gray-700">
                          {formatBytes(systemStatus.server.memoryUsage.rss)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-indigo-600 h-2.5 rounded-full" style={{
                          width: `${Math.min(100, (systemStatus.server.memoryUsage.rss / 1073741824) * 100)}%`
                        }}></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Memoria total asignada al proceso Node.js
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Heap Total</span>
                        <span className="text-sm font-medium text-gray-700">
                          {formatBytes(systemStatus.server.memoryUsage.heapTotal)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-blue-500 h-2.5 rounded-full" style={{
                          width: `${Math.min(100, (systemStatus.server.memoryUsage.heapTotal / systemStatus.server.memoryUsage.rss) * 100)}%`
                        }}></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Memoria total de heap asignada para JavaScript
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Heap Usado</span>
                        <span className="text-sm font-medium text-gray-700">
                          {formatBytes(systemStatus.server.memoryUsage.heapUsed)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-green-500 h-2.5 rounded-full" style={{
                          width: `${Math.min(100, (systemStatus.server.memoryUsage.heapUsed / systemStatus.server.memoryUsage.heapTotal) * 100)}%`
                        }}></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Memoria de heap actualmente en uso
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Uptime */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Tiempo de Actividad</h4>
                    
                    <div className="bg-white p-4 rounded border border-gray-200 text-center">
                      <div className="text-2xl font-bold text-indigo-700">
                        {formatDuration(systemStatus.server.uptime)}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Tiempo desde el inicio del servidor
                      </div>
                    </div>
                  </div>
                  
                  {/* System Info */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Información del Sistema</h4>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Sistema Operativo:</span>
                        <span className="text-sm text-gray-900">{systemStatus.server.platform}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Arquitectura:</span>
                        <span className="text-sm text-gray-900">{systemStatus.server.arch}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Versión Node.js:</span>
                        <span className="text-sm text-gray-900">{systemStatus.server.nodeVersion}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              <div className="bg-white p-6 border rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-800">Logs de Monitorización</h3>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={fetchMonitoringLogs}
                      className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm flex items-center"
                    >
                      <RefreshCw size={14} className="mr-1.5" />
                      Refrescar
                    </button>
                    
                    <button
                      onClick={downloadLogs}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 text-sm flex items-center"
                    >
                      <Download size={14} className="mr-1.5" />
                      Descargar
                    </button>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 overflow-auto" style={{ maxHeight: '500px' }}>
                  {monitoringLogs.length > 0 ? (
                    <div className="space-y-2">
                      {monitoringLogs.map((log, index) => (
                        <div key={index} className={`p-2 rounded ${
                          log.level === 'error' ? 'bg-red-50 border border-red-200' : 
                          log.level === 'warn' ? 'bg-yellow-50 border border-yellow-200' : 
                          log.level === 'debug' ? 'bg-gray-50 border border-gray-200' : 
                          'bg-white border border-gray-100'
                        }`}>
                          <div className="flex items-start">
                            <div className={`px-1.5 py-0.5 rounded text-xs mr-2 flex items-center ${
                              log.level === 'error' ? 'bg-red-100 text-red-800' : 
                              log.level === 'warn' ? 'bg-yellow-100 text-yellow-800' : 
                              log.level === 'debug' ? 'bg-gray-100 text-gray-800' : 
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {log.level.toUpperCase()}
                            </div>
                            <div className="text-gray-500 text-xs mr-2">
                              [{log.timestamp}]
                            </div>
                            <div className="text-sm text-gray-900">
                              {log.message}
                            </div>
                          </div>
                          {log.context && (
                            <div className="mt-1 text-xs text-gray-500 pl-16">
                              <button 
                                onClick={() => {
                                  const el = document.getElementById(`log-context-${index}`);
                                  if (el) {
                                    el.style.display = el.style.display === 'none' ? 'block' : 'none';
                                  }
                                }}
                                className="text-indigo-600 hover:text-indigo-800 underline flex items-center"
                              >
                                <ChevronDown size={12} className="mr-0.5" />
                                Contexto
                              </button>
                              <pre id={`log-context-${index}`} className="mt-1 p-2 bg-gray-100 rounded overflow-auto" style={{display: 'none'}}>
                                {log.context}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No se encontraron logs relacionados con la monitorización
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default ServerPage;