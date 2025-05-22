import React, { useState } from 'react';
import { useSensorData } from '../hooks/useSensorData';
import MainLayout from '../components/Layout/MainLayout';
import DatacenterSection from '../components/Dashboard/DatacenterSection';
import { Filter, AlertTriangle, X, ChevronDown } from 'lucide-react';

const RacksPage: React.FC = () => {
  const {
    loading,
    error,
    groupedData,
    lastUpdated,
    isAutoRefresh,
    refreshTime,
    fetchData,
    toggleAutoRefresh,
    updateRefreshTime
  } = useSensorData();

  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedDC, setSelectedDC] = useState<string>('');
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);

  // Get unique sites and DCs
  const sites = [...new Set(groupedData.map(group => group.site))];
  const dcs = [...new Set(groupedData
    .filter(group => !selectedSite || group.site === selectedSite)
    .map(group => group.dc))];

  // Filter data based on selections
  const filteredData = groupedData.filter(group => 
    (!selectedSite || group.site === selectedSite) &&
    (!selectedDC || group.dc === selectedDC)
  );

  // Further filter racks with problems if the switch is active
  const finalData = filteredData.map(group => ({
    ...group,
    racks: group.racks.filter(rack => 
      !showProblemsOnly || (rack as any).TEMP_ALERT || (rack as any).HUMIDITY_ALERT || (rack as any).POWER_ALERT
    )
  })).filter(group => group.racks.length > 0);

  return (
    <MainLayout
      title="Racks Management"
      lastUpdated={lastUpdated}
      loading={loading}
      onRefresh={fetchData}
      isAutoRefresh={isAutoRefresh}
      toggleAutoRefresh={toggleAutoRefresh}
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          Error: {error}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Filter size={20} className="text-gray-500" />
            <h3 className="text-lg font-medium text-gray-700">Filters</h3>
            {(selectedSite || selectedDC || showProblemsOnly) && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">•</span>
                <button
                  onClick={() => {
                    setSelectedSite('');
                    setSelectedDC('');
                    setShowProblemsOnly(false);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
                >
                  <X size={14} className="mr-1" />
                  Clear all
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="text-gray-500 hover:text-gray-700"
          >
            <ChevronDown
              size={20}
              className={`transform transition-transform ${isFiltersExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className={`space-y-4 ${isFiltersExpanded ? '' : 'hidden'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site
            </label>
            <div className="relative">
              <select
                value={selectedSite}
                onChange={(e) => {
                  setSelectedSite(e.target.value);
                  setSelectedDC('');
                }}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 pl-3 pr-10 py-2 appearance-none bg-white"
              >
                <option value="">All Sites</option>
                {sites.map(site => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Datacenter
            </label>
            <div className="relative">
              <select
                value={selectedDC}
                onChange={(e) => setSelectedDC(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 pl-3 pr-10 py-2 appearance-none bg-white"
              >
                <option value="">All Datacenters</option>
                {dcs.map(dc => (
                  <option key={dc} value={dc}>{dc}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={showProblemsOnly}
                onChange={(e) => setShowProblemsOnly(e.target.checked)}
              />
              <div className={`w-11 h-6 rounded-full peer ${showProblemsOnly ? 'bg-red-600' : 'bg-gray-200'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
              <div className="flex items-center ml-3 text-sm font-medium text-gray-700">
                <AlertTriangle size={16} className={`mr-1 ${showProblemsOnly ? 'text-red-500' : 'text-gray-400'}`} />
                Show Problems Only
              </div>
            </label>
            {(selectedSite || selectedDC || showProblemsOnly) && (
              <div className="text-sm text-gray-500">
                Active filters: {[
                  selectedSite && `Site: ${selectedSite}`,
                  selectedDC && `DC: ${selectedDC}`,
                  showProblemsOnly && 'Problems only'
                ].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>
        
        {showProblemsOnly && isFiltersExpanded && (
          <div className="mt-4 text-sm text-gray-500 bg-red-50 p-3 rounded-md border border-red-100">
            Showing only racks with active problems (temperature, humidity, or power alerts)
          </div>
        )}
      </div>

      {finalData.map((group) => (
        <DatacenterSection key={`${group.site}-${group.dc}`} group={group} />
      ))}

      {finalData.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {showProblemsOnly 
              ? 'No racks found with active problems matching the selected filters.'
              : 'No racks found with the selected filters.'}
          </p>
        </div>
      )}
    </MainLayout>
  );
};

export default RacksPage;