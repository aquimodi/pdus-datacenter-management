import { useState, useEffect, useCallback } from 'react';
import { Problem } from '../types';
import { useAppMode } from '../context/AppModeContext';
import { fetchProblemsData } from '../services/api';

interface UseProblemsDataProps {
  refreshInterval?: number;
  isHistorical?: boolean;
}

export const useProblemsData = ({ 
  refreshInterval = 30000,
  isHistorical = false 
}: UseProblemsDataProps = {}) => {
  const { isDemoMode } = useAppMode();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Problem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchProblemsData(isHistorical);
      
      if (response.status === "Success") {
        setData(response.data);
        setLastUpdated(new Date());
      } else {
        setError("Failed to fetch problems data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, [isHistorical]);

  // Handle auto-refresh
  useEffect(() => {
    if (!isAutoRefresh) return;
    
    const interval = setInterval(() => {
      fetchData();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [isAutoRefresh, refreshInterval, fetchData]);

  // Initial data fetch and refetch when mode changes
  useEffect(() => {
    fetchData();
  }, [fetchData, isDemoMode]);

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(prev => !prev);
  };

  return {
    loading,
    error,
    data,
    lastUpdated,
    isAutoRefresh,
    fetchData,
    toggleAutoRefresh
  };
};