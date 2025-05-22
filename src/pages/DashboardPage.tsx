import React, { useMemo } from 'react';
import { useSensorData } from '../hooks/useSensorData';
import MainLayout from '../components/Layout/MainLayout';
import StatusSummary from '../components/Dashboard/StatusSummary';
import DatacenterIndicators from '../components/Dashboard/DatacenterIndicators';

const DashboardPage: React.FC = () => {
  const {
    loading,
    error,
    data,
    groupedData,
    lastUpdated,
    isAutoRefresh,
    refreshTime,
    fetchData,
    toggleAutoRefresh,
    updateRefreshTime
  } = useSensorData();
  
  return (
    <MainLayout
      title="Dashboard"
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
      
      <StatusSummary data={data} />
      
      <div className="space-y-6">
        {groupedData.map((group) => (
          <DatacenterIndicators key={`${group.site}-${group.dc}`} group={group} />
        ))}
      </div>
      
      {groupedData.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="text-gray-500">No data available. Click refresh to fetch data.</p>
        </div>
      )}
    </MainLayout>
  );
};

export default DashboardPage;