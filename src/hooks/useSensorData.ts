import { useState, useEffect, useCallback, useMemo } from 'react';
import { ApiResponse, Rack, DatacenterGroup } from '../types';
import { fetchRackData, fetchSensorData, fetchThresholds } from '../services/api';
import { useThresholdSettings } from './useThresholdSettings';

interface UseSensorDataProps {
  refreshInterval?: number;
}

export const useSensorData = ({ refreshInterval }: UseSensorDataProps = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Rack[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [refreshTime, setRefreshTime] = useState(
    refreshInterval || Number(import.meta.env.VITE_DEFAULT_REFRESH_INTERVAL) || 30000
  );

  // Use the threshold settings hook
  const { thresholds } = useThresholdSettings();

  // Group data by datacenter and site
  const groupedData = useMemo(() => {
    const groupedByDc: Record<string, DatacenterGroup> = {};
    
    data.forEach(rack => {
      const key = `${rack.SITE}-${rack.DC}`;
      
      if (!groupedByDc[key]) {
        groupedByDc[key] = {
          site: rack.SITE,
          dc: rack.DC,
          racks: []
        };
      }
      
      groupedByDc[key].racks.push(rack);
    });
    
    return Object.values(groupedByDc);
  }, [data]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let response: ApiResponse;
      let sensorResponse;
      
      // Get data from API
      [response, sensorResponse] = await Promise.all([
        fetchRackData(),
        fetchSensorData()
      ]);
      
      // If we have sensor data, update the rack data with it
      if (sensorResponse?.status === "Success") {
        response.data = response.data.map(rack => {
          // Find all sensors for this rack
          const rackSensors = sensorResponse.data.filter(
            sensor => sensor.RACK_NAME === rack.NAME
          );
          
          if (rackSensors.length > 0) {
            // Get maximum temperature and humidity values
            const maxTemp = Math.max(...rackSensors.map(s => parseFloat(s.TEMPERATURE) || 0));
            const maxHumidity = Math.max(...rackSensors.map(s => parseFloat(s.HUMIDITY) || 0));
            
            return {
              ...rack,
              TEMPERATURE: maxTemp.toString(),
              HUMIDITY: maxHumidity.toString(),
              // Set alerts based on thresholds
              TEMP_ALERT: maxTemp > (Number(thresholds.max_temp) || 32) || maxTemp < (Number(thresholds.min_temp) || 18),
              HUMIDITY_ALERT: maxHumidity > (Number(thresholds.max_humidity) || 70) || maxHumidity < (Number(thresholds.min_humidity) || 40)
            };
          }
          
          return rack;
        });
      }
      
      if (response.status === "Success") {
        // Calculate power alerts based on phase type
        const dataWithAlerts = response.data.map(rack => {
          // Use the phase field with fallback to detect single phase by voltage
          const isSinglePhase = rack.phase 
            ? rack.phase === 'Single Phase' 
            : (rack.L2_VOLTS === null && rack.L3_VOLTS === null);
          
          // Set power alerts based on phase type
          const powerAlert = rack.TOTAL_AMPS 
            ? (isSinglePhase 
                ? Number(rack.TOTAL_AMPS) > (Number(thresholds.max_power_single_phase) || 16)
                : Number(rack.TOTAL_AMPS) > (Number(thresholds.max_power_three_phase) || 48))
            : false;
            
          return {
            ...rack,
            // Ensure the phase field exists
            phase: rack.phase || (isSinglePhase ? 'Single Phase' : '3-Phase'),
            POWER_ALERT: powerAlert
          };
        });
        
        setData(dataWithAlerts);
        setLastUpdated(new Date());
      } else {
        setError("Failed to fetch data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, [thresholds]);

  // Handle auto-refresh
  useEffect(() => {
    if (!isAutoRefresh) return;
    
    const interval = setInterval(() => {
      fetchData();
    }, refreshTime);
    
    return () => clearInterval(interval);
  }, [isAutoRefresh, refreshTime, fetchData]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(prev => !prev);
  };

  const updateRefreshTime = (time: number) => {
    setRefreshTime(time);
  };

  return {
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
  };
};