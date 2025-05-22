import React, { useMemo } from 'react';
import { Rack } from '../../types';
import { Thermometer as ThermometerHot, Droplets, Power, Info } from 'lucide-react';

interface StatusSummaryProps {
  data: Rack[];
}

const StatusSummary: React.FC<StatusSummaryProps> = ({ data }) => {
  const summary = useMemo(() => {
    const totalRacks = data.length;
    
    let tempAlerts = 0;
    let humidityAlerts = 0;
    let powerAlerts = 0;
    
    data.forEach((rack: any) => {
      if (rack.TEMP_ALERT) tempAlerts++;
      if (rack.HUMIDITY_ALERT) humidityAlerts++;
      if (rack.POWER_ALERT) powerAlerts++;
    });
    
    const totalAlerts = tempAlerts + humidityAlerts + powerAlerts;
    
    return {
      totalRacks,
      tempAlerts,
      humidityAlerts,
      powerAlerts,
      totalAlerts
    };
  }, [data]);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center">
          <div className="p-2 rounded-md bg-blue-50 text-blue-600">
            <Info size={20} />
          </div>
          <div className="ml-3">
            <div className="text-sm text-gray-500">Total Racks</div>
            <div className="text-xl font-semibold">{summary.totalRacks}</div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center">
          <div className={`p-2 rounded-md ${summary.tempAlerts > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            <ThermometerHot size={20} />
          </div>
          <div className="ml-3">
            <div className="text-sm text-gray-500">Temperature Alerts</div>
            <div className="text-xl font-semibold">{summary.tempAlerts}</div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center">
          <div className={`p-2 rounded-md ${summary.humidityAlerts > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            <Droplets size={20} />
          </div>
          <div className="ml-3">
            <div className="text-sm text-gray-500">Humidity Alerts</div>
            <div className="text-xl font-semibold">{summary.humidityAlerts}</div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center">
          <div className={`p-2 rounded-md ${summary.powerAlerts > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            <Power size={20} />
          </div>
          <div className="ml-3">
            <div className="text-sm text-gray-500">Power Alerts</div>
            <div className="text-xl font-semibold">{summary.powerAlerts}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusSummary;