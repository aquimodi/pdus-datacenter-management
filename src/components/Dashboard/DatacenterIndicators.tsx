import React from 'react';
import { DatacenterGroup } from '../../types';
import { Thermometer, Droplets, Power, Server } from 'lucide-react';

interface DatacenterIndicatorsProps {
  group: DatacenterGroup;
}

const DatacenterIndicators: React.FC<DatacenterIndicatorsProps> = ({ group }) => {
  const totalRacks = group.racks.length;
  
  const tempAlerts = group.racks.filter((rack: any) => rack.TEMP_ALERT).length;
  const humidityAlerts = group.racks.filter((rack: any) => rack.HUMIDITY_ALERT).length;
  const powerAlerts = group.racks.filter((rack: any) => rack.POWER_ALERT).length;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex items-center mb-4">
        <Server className="text-indigo-600 mr-2" size={20} />
        <h3 className="text-lg font-medium text-gray-800">
          {group.site} - {group.dc}
        </h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">Total Racks</div>
            <Server size={18} className="text-gray-400" />
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-800">{totalRacks}</div>
          <div className="text-xs text-gray-500">Active racks</div>
        </div>
        
        <div className={`bg-gray-50 p-3 rounded-lg border ${tempAlerts > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">Temperature Alerts</div>
            <Thermometer size={18} className={tempAlerts > 0 ? 'text-red-500' : 'text-gray-400'} />
          </div>
          <div className={`mt-1 text-2xl font-semibold ${tempAlerts > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {tempAlerts}
          </div>
          <div className="text-xs text-gray-500">
            {totalRacks - tempAlerts} normal
          </div>
        </div>
        
        <div className={`bg-gray-50 p-3 rounded-lg border ${humidityAlerts > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">Humidity Alerts</div>
            <Droplets size={18} className={humidityAlerts > 0 ? 'text-red-500' : 'text-gray-400'} />
          </div>
          <div className={`mt-1 text-2xl font-semibold ${humidityAlerts > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {humidityAlerts}
          </div>
          <div className="text-xs text-gray-500">
            {totalRacks - humidityAlerts} normal
          </div>
        </div>
        
        <div className={`bg-gray-50 p-3 rounded-lg border ${powerAlerts > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">Power Alerts</div>
            <Power size={18} className={powerAlerts > 0 ? 'text-red-500' : 'text-gray-400'} />
          </div>
          <div className={`mt-1 text-2xl font-semibold ${powerAlerts > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {powerAlerts}
          </div>
          <div className="text-xs text-gray-500">
            {totalRacks - powerAlerts} normal
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatacenterIndicators;