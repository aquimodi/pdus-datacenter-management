import { useState, useEffect } from 'react';
import { Threshold } from '../types';
import { fetchThresholds } from '../services/api';

const LOCAL_STORAGE_KEY = 'thresholdSettings';

interface UseThresholdSettingsResult {
  thresholds: Partial<Threshold>;
  setThresholds: (newThresholds: Partial<Threshold>) => void;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useThresholdSettings = (): UseThresholdSettingsResult => {
  const [thresholds, setThresholdsState] = useState<Partial<Threshold>>(() => {
    try {
      const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
      return storedSettings ? JSON.parse(storedSettings) : {
        min_temp: 18.0,
        max_temp: 32.0,
        min_humidity: 40.0,
        max_humidity: 70.0,
        max_power_single_phase: 16.0,
        max_power_three_phase: 48.0
      };
    } catch (error) {
      console.error("Error loading threshold settings from localStorage:", error);
      return {
        min_temp: 18.0,
        max_temp: 32.0,
        min_humidity: 40.0,
        max_humidity: 70.0,
        max_power_single_phase: 16.0,
        max_power_three_phase: 48.0
      };
    }
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setThresholds = (newThresholds: Partial<Threshold>) => {
    setThresholdsState(prev => ({ ...prev, ...newThresholds }));
  };

  // Función para obtener los umbrales desde el servidor
  const fetchThresholdsFromServer = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchThresholds();
      if (response.status === "Success" && response.data && response.data.length > 0) {
        const serverThresholds = response.data[0];
        
        // Actualizar los umbrales con los datos del servidor
        setThresholds({
          id: serverThresholds.id,
          name: serverThresholds.name || 'global',
          min_temp: Number(serverThresholds.min_temp) || 18.0,
          max_temp: Number(serverThresholds.max_temp) || 32.0,
          min_humidity: Number(serverThresholds.min_humidity) || 40.0,
          max_humidity: Number(serverThresholds.max_humidity) || 70.0,
          max_power_single_phase: Number(serverThresholds.max_power_single_phase) || 16.0,
          max_power_three_phase: Number(serverThresholds.max_power_three_phase) || 48.0,
          created_at: serverThresholds.created_at,
          updated_at: serverThresholds.updated_at
        });
      }
    } catch (err) {
      console.error("Error fetching thresholds from server:", err);
      setError("No se pudieron obtener los umbrales del servidor");
    } finally {
      setIsLoading(false);
    }
  };

  // Efecto para cargar los umbrales inicialmente
  useEffect(() => {
    fetchThresholdsFromServer();
  }, []);

  // Efecto para guardar en localStorage cuando cambian los umbrales
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(thresholds));
    } catch (error) {
      console.error("Error saving threshold settings to localStorage:", error);
    }
  }, [thresholds]);

  return { 
    thresholds, 
    setThresholds,
    isLoading,
    error,
    refetch: fetchThresholdsFromServer
  };
};