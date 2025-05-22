import React, { useState, useEffect } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { Settings, Thermometer, Droplets, Power, Bell, Check, RefreshCw, Database, Globe, AlertCircle, Snowflake, ServerOff, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { useSensorData } from '../hooks/useSensorData';
import { fetchThresholds, updateThresholds } from '../services/api';
import { useThresholdSettings } from '../hooks/useThresholdSettings';
import { routeRequest } from '../api/route';

const ConfigurationPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'thresholds' | 'notifications' | 'system' | 'refresh' | 'api' | 'database' | 'monitoring'>('thresholds');
  const { refreshTime, isAutoRefresh, toggleAutoRefresh, updateRefreshTime } = useSensorData();
  const [apiTestResults, setApiTestResults] = useState<{[key: string]: { status: string; data?: any; error?: string }}>({});
  const [isTestingApi, setIsTestingApi] = useState<{[key: string]: boolean}>({});
  
  // Monitoring service state
  const [monitoringStatus, setMonitoringStatus] = useState<any>(null);
  const [isMonitoringLoading, setIsMonitoringLoading] = useState(false);
  const [monitoringInterval, setMonitoringInterval] = useState<number>(300000); // Default 5 minutes
  
  // Use the custom hook
  const { thresholds, setThresholds } = useThresholdSettings();
  
  // Threshold values - use values from the hook or defaults
  const [minTempThreshold, setMinTempThreshold] = useState(Number(thresholds.min_temp) || 18);
  const [maxTempThreshold, setMaxTempThreshold] = useState(Number(thresholds.max_temp) || 32);
  const [minHumidityThreshold, setMinHumidityThreshold] = useState(Number(thresholds.min_humidity) || 40);
  const [maxHumidityThreshold, setMaxHumidityThreshold] = useState(Number(thresholds.max_humidity) || 70);
  const [powerSingleThreshold, setPowerSingleThreshold] = useState(Number(thresholds.max_power_single_phase) || 16);
  const [powerTripleThreshold, setPowerTripleThreshold] = useState(Number(thresholds.max_power_three_phase) || 48);
  const [showSaveNotification, setShowSaveNotification] = useState(false);
  const [thresholdsLoading, setThresholdsLoading] = useState(false);
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  
  // Only allow Managers and Admins to access this page
  if (user?.role === 'Operator') {
    return <Navigate to="/" replace />;
  }
  
  // Fetch monitoring status
  useEffect(() => {
    if (activeTab === 'monitoring') {
      fetchMonitoringStatus();
    }
  }, [activeTab]);
  
  const fetchMonitoringStatus = async () => {
    setIsMonitoringLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}/api/system/status`);
      const data = await response.json();
      if (data && data.monitoring) {
        setMonitoringStatus(data.monitoring);
        if (data.monitoring.interval) {
          setMonitoringInterval(data.monitoring.interval);
        }
      }
    } catch (error) {
      console.error('Failed to fetch monitoring status:', error);
    } finally {
      setIsMonitoringLoading(false);
    }
  };
  
  const controlMonitoring = async (action: string) => {
    setIsMonitoringLoading(true);
    try {
      let endpoint;
      let body = {};
      
      if (action === 'start') {
        endpoint = '/api/monitoring/start';
        body = { interval: monitoringInterval };
      } else if (action === 'stop') {
        endpoint = '/api/monitoring/stop';
      } else if (action === 'run-now') {
        endpoint = '/api/monitoring/run-now';
      }
      
      await routeRequest({
        destination: `${import.meta.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000'}${endpoint}`,
        method: 'POST',
        body
      });
      
      // Refresh the status after control action
      await fetchMonitoringStatus();
    } catch (error) {
      console.error(`Failed to ${action} monitoring service:`, error);
    } finally {
      setIsMonitoringLoading(false);
    }
  };

  // Load thresholds from API
  useEffect(() => {
    const loadThresholds = async () => {
      setThresholdsLoading(true);
      setThresholdsError(null);
      try {
        const response = await fetchThresholds();
        if (response.status === "Success" && response.data.length > 0) {
          const thresholdsData = response.data[0];
          setMinTempThreshold(Number(thresholdsData.min_temp) || 18);
          setMaxTempThreshold(Number(thresholdsData.max_temp) || 32);
          setMinHumidityThreshold(Number(thresholdsData.min_humidity) || 40);
          setMaxHumidityThreshold(Number(thresholdsData.max_humidity) || 70);
          setPowerSingleThreshold(Number(thresholdsData.max_power_single_phase) || 16);
          setPowerTripleThreshold(Number(thresholdsData.max_power_three_phase) || 48);
          
          // Update local storage
          setThresholds({
            min_temp: Number(thresholdsData.min_temp) || 18,
            max_temp: Number(thresholdsData.max_temp) || 32,
            min_humidity: Number(thresholdsData.min_humidity) || 40,
            max_humidity: Number(thresholdsData.max_humidity) || 70,
            max_power_single_phase: Number(thresholdsData.max_power_single_phase) || 16,
            max_power_three_phase: Number(thresholdsData.max_power_three_phase) || 48
          });
        }
      } catch (error) {
        console.error('Error loading thresholds:', error);
        setThresholdsError('No se pudieron cargar los umbrales de la base de datos');
      } finally {
        setThresholdsLoading(false);
      }
    };
    
    if (activeTab === 'thresholds') {
      loadThresholds();
    }
  }, [activeTab, setThresholds]);

  const handleSaveThresholds = async () => {
    try {
      const newThresholds = {
        min_temp: minTempThreshold,
        max_temp: maxTempThreshold,
        min_humidity: minHumidityThreshold,
        max_humidity: maxHumidityThreshold,
        max_power_single_phase: powerSingleThreshold,
        max_power_three_phase: powerTripleThreshold,
      };
      
      // Update local storage
      setThresholds(newThresholds);
      
      const response = await updateThresholds(newThresholds);
      if (response.status === "Success") {
        setShowSaveNotification(true);
        setTimeout(() => setShowSaveNotification(false), 3000);
      } else {
        setThresholdsError('Error guardando los umbrales. Por favor intente nuevamente.');
      }
    } catch (error) {
      console.error('Error saving thresholds:', error);
      setThresholdsError('Error guardando los umbrales. Por favor intente nuevamente.');
    }
  };

  const testApi = async (endpoint: string) => {
    setIsTestingApi(prev => ({ ...prev, [endpoint]: true }));
    try {
      const apiKey = import.meta.env.VITE_API_KEY;
      
      const headers = new Headers();
      if (apiKey) {
        headers.set('Authorization', `Bearer ${apiKey}`);
      }
      headers.set('Content-Type', 'application/json');
      headers.set('Accept', 'application/json');

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      setApiTestResults(prev => ({
        ...prev,
        [endpoint]: { status: 'success', data }
      }));
    } catch (error) {
      setApiTestResults(prev => ({
        ...prev,
        [endpoint]: { status: 'error', error: error.message }
      }));
    } finally {
      setIsTestingApi(prev => ({ ...prev, [endpoint]: false }));
    }
  };

  return (
    <MainLayout
      title="Configuration"
      lastUpdated={null}
      loading={false}
      onRefresh={() => {}}
      isAutoRefresh={false}
      toggleAutoRefresh={() => {}}
    >
      <div className="space-y-6">
        {showSaveNotification && (
          <div className="fixed top-4 right-4 bg-green-100 border border-green-200 text-green-700 px-4 py-3 rounded-md shadow-md flex items-center z-50">
            <Check size={18} className="mr-2" />
            Configuración guardada correctamente
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <Settings size={20} className="text-gray-500 mr-2" />
              <h2 className="text-lg font-medium text-gray-800">Configuración del Sistema</h2>
            </div>
          </div>
          
          <div className="border-b border-gray-200">
            <div className="flex px-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab('thresholds')}
                className={`py-3 px-4 ${
                  activeTab === 'thresholds'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Umbrales de Alerta
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`py-3 px-4 ${
                  activeTab === 'notifications'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Notificaciones
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`py-3 px-4 ${
                  activeTab === 'system'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Config. del Sistema
              </button>
              <button
                onClick={() => setActiveTab('refresh')}
                className={`py-3 px-4 ${
                  activeTab === 'refresh'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Actualización de Datos
              </button>
              <button
                onClick={() => setActiveTab('api')}
                className={`py-3 px-4 ${
                  activeTab === 'api'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Prueba de API
              </button>
              <button
                onClick={() => setActiveTab('database')}
                className={`py-3 px-4 ${
                  activeTab === 'database'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Base de Datos
              </button>
              <button
                onClick={() => {
                  setActiveTab('monitoring');
                  fetchMonitoringStatus();
                }}
                className={`py-3 px-4 ${
                  activeTab === 'monitoring'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Monitorización
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {activeTab === 'thresholds' && (
              <div className="space-y-6">
                {thresholdsLoading ? (
                  <div className="text-center p-4">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
                    <p>Cargando configuración de umbrales...</p>
                  </div>
                ) : (
                  <>
                    {thresholdsError && (
                      <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4 flex items-center">
                        <AlertCircle size={18} className="mr-2" />
                        {thresholdsError}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center mb-4">
                          <div className="p-2 rounded-md bg-red-50 text-red-600 mr-3">
                            <Thermometer size={20} />
                          </div>
                          <h3 className="font-medium">Umbrales de Temperatura</h3>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">
                              Temperatura Mínima (°C)
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                value={minTempThreshold}
                                onChange={(e) => setMinTempThreshold(Number(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-gray-500">°C</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              <Snowflake size={12} className="inline mr-1" />
                              Se generará una alerta si la temperatura desciende por debajo de este valor
                            </p>
                          </div>
                          
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">
                              Temperatura Máxima (°C)
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                value={maxTempThreshold}
                                onChange={(e) => setMaxTempThreshold(Number(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-gray-500">°C</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              <Thermometer size={12} className="inline mr-1" />
                              Se generará una alerta si la temperatura supera este valor
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center mb-4">
                          <div className="p-2 rounded-md bg-blue-50 text-blue-600 mr-3">
                            <Droplets size={20} />
                          </div>
                          <h3 className="font-medium">Umbrales de Humedad</h3>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">
                              Humedad Mínima (%)
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                value={minHumidityThreshold}
                                onChange={(e) => setMinHumidityThreshold(Number(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-gray-500">%</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              <AlertCircle size={12} className="inline mr-1" />
                              Se generará una alerta si la humedad desciende por debajo de este valor
                            </p>
                          </div>
                          
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">
                              Humedad Máxima (%)
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                value={maxHumidityThreshold}
                                onChange={(e) => setMaxHumidityThreshold(Number(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-gray-500">%</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              <Droplets size={12} className="inline mr-1" />
                              Se generará una alerta si la humedad supera este valor
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center mb-4">
                          <div className="p-2 rounded-md bg-yellow-50 text-yellow-600 mr-3">
                            <Power size={20} />
                          </div>
                          <h3 className="font-medium">Umbrales de Potencia</h3>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">
                              Corriente Máxima Monofásica (A)
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                value={powerSingleThreshold}
                                onChange={(e) => setPowerSingleThreshold(Number(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-gray-500">A</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">
                              Corriente Máxima Trifásica (A)
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                value={powerTripleThreshold}
                                onChange={(e) => setPowerTripleThreshold(Number(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-gray-500">A</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end mt-6">
                      <button
                        onClick={handleSaveThresholds}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Guardar Umbrales
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center mb-4">
                    <div className="p-2 rounded-md bg-purple-50 text-purple-600 mr-3">
                      <Bell size={20} />
                    </div>
                    <h3 className="font-medium">Configuración de Notificaciones</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                      <div>
                        <h4 className="font-medium">Notificaciones por Email</h4>
                        <p className="text-sm text-gray-500">Recibir alertas por correo electrónico</p>
                      </div>
                      <div className="relative inline-block w-10 mr-2 align-middle select-none">
                        <input type="checkbox" id="email-toggle" className="sr-only" />
                        <label htmlFor="email-toggle" className="block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                      <div>
                        <h4 className="font-medium">Notificaciones por SMS</h4>
                        <p className="text-sm text-gray-500">Recibir alertas por SMS</p>
                      </div>
                      <div className="relative inline-block w-10 mr-2 align-middle select-none">
                        <input type="checkbox" id="sms-toggle" className="sr-only" />
                        <label htmlFor="sms-toggle" className="block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <h4 className="font-medium">Notificaciones en Dashboard</h4>
                        <p className="text-sm text-gray-500">Recibir alertas en el dashboard</p>
                      </div>
                      <div className="relative inline-block w-10 mr-2 align-middle select-none">
                        <input type="checkbox" id="dashboard-toggle" className="sr-only" defaultChecked />
                        <label htmlFor="dashboard-toggle" className="block overflow-hidden h-6 rounded-full bg-indigo-600 cursor-pointer"></label>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 text-center text-sm text-gray-500 bg-gray-50 p-4 rounded-md">
                  <p>La configuración de notificaciones estará disponible en la Fase 2 del proyecto.</p>
                </div>
              </div>
            )}
            
            {activeTab === 'system' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-medium mb-4">Integraciones de Entrada</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">
                        Endpoint API de Racks
                      </label>
                      <input
                        type="text" 
                        value={import.meta.env.VITE_API1_URL}
                        readOnly
                        className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">
                        Endpoint API de Sensores
                      </label>
                      <input
                        type="text" 
                        value={import.meta.env.VITE_API2_URL}
                        readOnly
                        className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">
                        Intervalo de Actualización Predeterminado (ms)
                      </label>
                      <input
                        type="number"
                        defaultValue={import.meta.env.VITE_DEFAULT_REFRESH_INTERVAL}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 text-center text-sm text-gray-500 bg-gray-50 p-4 rounded-md">
                  <p>La configuración completa de integraciones del sistema estará disponible en la Fase 2 del proyecto.</p>
                </div>
              </div>
            )}
            
            {activeTab === 'refresh' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center mb-4">
                    <div className="p-2 rounded-md bg-indigo-50 text-indigo-600 mr-3">
                      <RefreshCw size={20} />
                    </div>
                    <h3 className="font-medium">Configuración de Actualización de Datos</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                      <div>
                        <h4 className="font-medium">Actualización Automática</h4>
                        <p className="text-sm text-gray-500">Actualizar automáticamente los datos a intervalos específicos</p>
                      </div>
                      <div className="relative inline-block w-10 mr-2 align-middle select-none">
                        <input
                          type="checkbox"
                          checked={isAutoRefresh}
                          onChange={toggleAutoRefresh}
                          className="sr-only"
                          id="auto-refresh-toggle"
                        />
                        <label
                          htmlFor="auto-refresh-toggle"
                          className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                            isAutoRefresh ? 'bg-indigo-600' : 'bg-gray-300'
                          }`}
                        ></label>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">Intervalo de Actualización</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          { label: '10s', value: 10000 },
                          { label: '30s', value: 30000 },
                          { label: '1m', value: 60000 },
                          { label: '5m', value: 300000 }
                        ].map((interval) => (
                          <button
                            key={interval.value}
                            onClick={() => updateRefreshTime(interval.value)}
                            className={`px-3 py-2 text-sm rounded-md ${
                              refreshTime === interval.value
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {interval.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">Intervalo Personalizado</h4>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="1"
                          max="3600"
                          value={refreshTime / 1000}
                          onChange={(e) => updateRefreshTime(Number(e.target.value) * 1000)}
                          className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        />
                        <span className="text-gray-500">segundos</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'api' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center mb-4">
                    <div className="p-2 rounded-md bg-blue-50 text-blue-600 mr-3">
                      <Globe size={20} />
                    </div>
                    <h3 className="font-medium">Prueba de Endpoints API</h3>
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { name: 'API de Racks', url: import.meta.env.VITE_API1_URL },
                      { name: 'API de Sensores', url: import.meta.env.VITE_API2_URL }
                    ].map((api) => (
                      <div key={api.url} className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{api.name}</h4>
                            <p className="text-sm text-gray-500">{api.url}</p>
                          </div>
                          <button
                            onClick={() => testApi(api.url)}
                            disabled={isTestingApi[api.url]}
                            className={`px-4 py-2 rounded-md text-white ${
                              isTestingApi[api.url]
                                ? 'bg-gray-400'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                          >
                            {isTestingApi[api.url] ? 'Probando...' : 'Probar Conexión'}
                          </button>
                        </div>
                        
                        {apiTestResults[api.url] && (
                          <div className={`mt-2 p-2 rounded text-sm ${
                            apiTestResults[api.url].status === 'success'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {apiTestResults[api.url].status === 'success'
                              ? 'Conexión exitosa'
                              : `Error: ${apiTestResults[api.url].error}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'database' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center mb-4">
                    <div className="p-2 rounded-md bg-purple-50 text-purple-600 mr-3">
                      <Database size={20} />
                    </div>
                    <h3 className="font-medium">Configuración de Base de Datos</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <h4 className="font-medium mb-4">Conexión SQL Server</h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Servidor</label>
                          <div className="mt-1 p-2 bg-gray-50 rounded-md text-sm text-gray-900">
                            {import.meta.env.VITE_SQL_SERVER}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Base de Datos</label>
                          <div className="mt-1 p-2 bg-gray-50 rounded-md text-sm text-gray-900">
                            {import.meta.env.VITE_SQL_DATABASE}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Usuario</label>
                          <div className="mt-1 p-2 bg-gray-50 rounded-md text-sm text-gray-900">
                            {import.meta.env.VITE_SQL_USER}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                          <div className="mt-1 p-2 bg-gray-50 rounded-md text-sm text-gray-900">
                            ••••••••
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 text-sm text-gray-500">
                        <p>Nota: La configuración de la base de datos solo puede modificarse a través de variables de entorno.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'monitoring' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center mb-4">
                    <div className="p-2 rounded-md bg-green-50 text-green-600 mr-3">
                      <Server size={20} />
                    </div>
                    <h3 className="font-medium">Monitorización Automática</h3>
                  </div>
                  
                  {isMonitoringLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <RefreshCw size={24} className="animate-spin text-indigo-500 mr-2" />
                      <p>Cargando datos de monitorización...</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-medium">Estado del Servicio de Monitorización</h4>
                              <p className="text-sm text-gray-500">
                                Este servicio consulta periódicamente las APIs externas y guarda los datos en la base de datos
                              </p>
                            </div>
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${monitoringStatus?.active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                              <span className={`font-medium ${monitoringStatus?.active ? 'text-green-600' : 'text-red-600'}`}>
                                {monitoringStatus?.active ? 'Activo' : 'Detenido'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-1">Intervalo de Monitorización</h5>
                              <div className="flex items-center">
                                <input
                                  type="number"
                                  min="10"
                                  max="3600"
                                  value={monitoringInterval / 1000}
                                  onChange={(e) => setMonitoringInterval(Number(e.target.value) * 1000)}
                                  className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                  disabled={monitoringStatus?.active}
                                />
                                <span className="ml-2 text-gray-500">segundos</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Tiempo entre consultas a las APIs externas
                              </p>
                            </div>
                            
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-1">Última Ejecución</h5>
                              <div className="bg-gray-50 p-2 rounded-md text-sm text-gray-900">
                                {monitoringStatus?.lastRun ? new Date(monitoringStatus.lastRun).toLocaleString() : 'Nunca'}
                              </div>
                              {monitoringStatus?.lastRunTime && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Duración: {monitoringStatus.lastRunTime}ms
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-1">Estado API1</h5>
                              <div className={`flex items-center ${monitoringStatus?.api1Reachable ? 'text-green-600' : 'text-red-600'}`}>
                                <div className={`w-2 h-2 rounded-full mr-2 ${monitoringStatus?.api1Reachable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                {monitoringStatus?.api1Reachable ? 'Alcanzable' : 'No alcanzable'}
                              </div>
                            </div>
                            
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-1">Estado API2</h5>
                              <div className={`flex items-center ${monitoringStatus?.api2Reachable ? 'text-green-600' : 'text-red-600'}`}>
                                <div className={`w-2 h-2 rounded-full mr-2 ${monitoringStatus?.api2Reachable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                {monitoringStatus?.api2Reachable ? 'Alcanzable' : 'No alcanzable'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex space-x-3">
                            {!monitoringStatus?.active ? (
                              <button
                                onClick={() => controlMonitoring('start')}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                              >
                                Iniciar Monitorización
                              </button>
                            ) : (
                              <button
                                onClick={() => controlMonitoring('stop')}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              >
                                Detener Monitorización
                              </button>
                            )}
                            
                            <button
                              onClick={() => controlMonitoring('run-now')}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Ejecutar Ahora
                            </button>
                            
                            <button
                              onClick={fetchMonitoringStatus}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                            >
                              Actualizar Estado
                            </button>
                          </div>
                        </div>
                        
                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded-md">
                          <div className="flex items-center mb-2">
                            <AlertCircle size={18} className="mr-2" />
                            <h4 className="font-medium">Nota Importante</h4>
                          </div>
                          <p className="text-sm">
                            El servicio de monitorización consulta periódicamente las APIs externas, 
                            guarda los datos en la base de datos y genera problemas cuando se detectan 
                            valores fuera de los umbrales establecidos.
                          </p>
                          <p className="text-sm mt-2">
                            Si las APIs externas no son accesibles, el servicio seguirá funcionando pero 
                            utilizará datos de simulación como respaldo.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ConfigurationPage;