import React, { useState } from 'react';

interface RefreshControlsProps {
  refreshTime: number;
  isAutoRefresh: boolean;
  toggleAutoRefresh: () => void;
  updateRefreshTime: (time: number) => void;
}

const RefreshControls: React.FC<RefreshControlsProps> = ({
  refreshTime,
  isAutoRefresh,
  toggleAutoRefresh,
  updateRefreshTime,
}) => {
  const [customTime, setCustomTime] = useState(refreshTime / 1000);

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setCustomTime(value);
  };

  const handleCustomTimeSubmit = () => {
    updateRefreshTime(customTime * 1000);
  };

  const presetTimes = [
    { label: '10s', value: 10000 },
    { label: '30s', value: 30000 },
    { label: '1m', value: 60000 },
    { label: '5m', value: 300000 },
  ];

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Data Refresh Settings</h3>
      
      <div className="flex items-center space-x-4">
        <div>
          <label htmlFor="auto-refresh" className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                id="auto-refresh"
                type="checkbox"
                className="sr-only"
                checked={isAutoRefresh}
                onChange={toggleAutoRefresh}
              />
              <div className={`block w-10 h-6 rounded-full ${isAutoRefresh ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isAutoRefresh ? 'transform translate-x-4' : ''}`}></div>
            </div>
            <div className="ml-3 text-sm">Auto refresh</div>
          </label>
        </div>
        
        <div className="flex-grow">
          <div className="text-sm mb-1">Refresh interval:</div>
          <div className="flex space-x-2">
            {presetTimes.map((time) => (
              <button
                key={time.value}
                onClick={() => updateRefreshTime(time.value)}
                className={`px-2 py-1 text-xs rounded-md ${
                  refreshTime === time.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {time.label}
              </button>
            ))}
            
            <div className="flex items-center">
              <input
                type="number"
                min="1"
                max="3600"
                value={customTime}
                onChange={handleCustomTimeChange}
                className="w-16 text-xs p-1 border border-gray-300 rounded"
              />
              <span className="mx-1 text-xs">s</span>
              <button
                onClick={handleCustomTimeSubmit}
                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefreshControls;