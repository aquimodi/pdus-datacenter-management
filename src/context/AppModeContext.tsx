import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AppMode } from '../types';

interface AppModeContextType extends AppMode {
  toggleMode: () => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

// Always return false for demo mode
export const getGlobalDemoMode = (): boolean => {
  return false;
};

export const AppModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Force isDemoMode to always be false
  const [isDemoMode] = useState(false);

  // Dummy function that does nothing, kept for backward compatibility
  const toggleMode = () => {
    // Do nothing, we always want to use real data
  };

  return (
    <AppModeContext.Provider value={{ isDemoMode: false, toggleMode }}>
      {children}
    </AppModeContext.Provider>
  );
};

export const useAppMode = (): AppModeContextType => {
  const context = useContext(AppModeContext);
  if (context === undefined) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  
  // Always return false for isDemoMode, regardless of what's in the context
  return {
    isDemoMode: false,
    toggleMode: context.toggleMode
  };
};