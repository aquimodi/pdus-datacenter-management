import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AppMode } from '../types';

interface AppModeContextType extends AppMode {
  toggleMode: () => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

// Create a global variable to store the isDemoMode state
// This allows components that don't have direct access to the context
// to still access the current mode
let globalIsDemoMode = true;

export const getGlobalDemoMode = (): boolean => {
  return globalIsDemoMode;
};

export const AppModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Update the global variable when isDemoMode changes
  useEffect(() => {
    globalIsDemoMode = isDemoMode;
  }, [isDemoMode]);

  const toggleMode = () => {
    setIsDemoMode((prev) => !prev);
  };

  return (
    <AppModeContext.Provider value={{ isDemoMode, toggleMode }}>
      {children}
    </AppModeContext.Provider>
  );
};

export const useAppMode = (): AppModeContextType => {
  const context = useContext(AppModeContext);
  if (context === undefined) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  return context;
};