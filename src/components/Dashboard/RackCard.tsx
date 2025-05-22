import React from 'react';
import { Rack } from '../../types';
import { Thermometer as ThermometerHot, Droplets, Power, Server, Snowflake } from 'lucide-react';
import { useThresholdSettings } from '../../hooks/useThresholdSettings';

interface RackCardProps {
  rack: Rack & {
    TEMPERATURE?: string;
    HUMIDITY?: string;
    TEMP_ALERT?: boolean;
    HUMIDITY_ALERT?: boolean;
    POWER_ALERT?: boolean;
  };
}

const RackCard: React.FC<RackCardProps> = ({ rack }) => {
  const temperature = rack.TEMPERATURE || 'N/A';
  const humidity = rack.HUMIDITY || 'N/A';
  const current = rack.TOTAL_AMPS || 'N/A';
  
  const { thresholds } = useThresholdSettings();
  
  // Determinar si la alerta de temperatura es por alta o baja temperatura
  const isHighTemp = Number(temperature) > (Number(thresholds.max_temp) || 32);
  const isLowTemp = Number(temperature) < (Number(thresholds.min_temp) || 18);
  
  // Determinar si la alerta de humedad es por alta o baja humedad
  const isHighHumidity = Number(humidity) > (Number(thresholds.max_humidity) || 70);
  const isLowHumidity = Number(humidity) < (Number(thresholds.min_humidity) || 40);
  
  const tempAlert = isHighTemp || isLowTemp;
  const humidityAlert = isHighHumidity || isLowHumidity;
  const powerAlert = rack.POWER_ALERT;
  
  // Use the new phase field to determine if rack is single or three phase
  // With fallback to legacy method in case phase is not set
  const isSinglePhase = rack.phase 
    ? rack.phase === 'Single Phase' 
    : (rack.L2_VOLTS === null && rack.L3_VOLTS === null);
  
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="font-medium text-gray-800">{rack.NAME}</div>
          <span className={`px-2 py-1 text-xs font-medium rounded ${
            isSinglePhase 
              ? 'bg-blue-100 text-blue-800'
              : 'bg-purple-100 text-purple-800'
          }`}>
            {isSinglePhase ? 'Monofásico' : 'Trifásico'}
          </span>
        </div>
      </div>
      
      <div className="flex p-4">
        {/* Rack illustration */}
        <div className="w-16 bg-gray-100 rounded-lg mr-4 flex flex-col items-center justify-between p-2">
          <Server className="text-gray-400" size={24} />
          <div className="text-xs text-gray-500 mt-1">{rack.MAXU}U</div>
        </div>
        
        {/* Vertical metrics */}
        <div className="flex-1 flex flex-col justify-between space-y-2">
          <div className={`p-2 rounded-lg ${
            isHighTemp ? 'bg-red-50' : 
            isLowTemp ? 'bg-blue-50' : 
            'bg-gray-50'
          } flex items-center justify-between`}>
            <div className="flex items-center">
              {isHighTemp ? (
                <ThermometerHot size={18} className="text-red-500" />
              ) : isLowTemp ? (
                <Snowflake size={18} className="text-blue-500" />
              ) : (
                <ThermometerHot size={18} className="text-gray-500" />
              )}
              <span className="ml-2 text-sm">Temperatura</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold">{temperature !== 'N/A' ? `${temperature}°C` : 'N/A'}</span>
              {isHighTemp && <span className="w-2 h-2 ml-2 rounded-full bg-red-500"></span>}
              {isLowTemp && <span className="w-2 h-2 ml-2 rounded-full bg-blue-500"></span>}
            </div>
          </div>
          
          <div className={`p-2 rounded-lg ${
            isHighHumidity ? 'bg-red-50' : 
            isLowHumidity ? 'bg-yellow-50' : 
            'bg-gray-50'
          } flex items-center justify-between`}>
            <div className="flex items-center">
              <Droplets size={18} className={
                isHighHumidity ? 'text-red-500' : 
                isLowHumidity ? 'text-yellow-500' : 
                'text-gray-500'
              } />
              <span className="ml-2 text-sm">Humedad</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold">{humidity !== 'N/A' ? `${humidity}%` : 'N/A'}</span>
              {isHighHumidity && <span className="w-2 h-2 ml-2 rounded-full bg-red-500"></span>}
              {isLowHumidity && <span className="w-2 h-2 ml-2 rounded-full bg-yellow-500"></span>}
            </div>
          </div>
          
          <div className={`p-2 rounded-lg ${powerAlert ? 'bg-red-50' : 'bg-gray-50'} flex items-center justify-between`}>
            <div className="flex items-center">
              <Power size={18} className={powerAlert ? 'text-red-500' : 'text-gray-500'} />
              <span className="ml-2 text-sm">Corriente</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold">{current !== 'N/A' ? `${current}A` : 'N/A'}</span>
              {powerAlert && <span className="w-2 h-2 ml-2 rounded-full bg-red-500"></span>}
            </div>
          </div>
        </div>
      </div>
      
      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
        <div>Potencia Máxima: {rack.MAXPOWER} kW</div>
      </div>
    </div>
  );
};

export default RackCard;