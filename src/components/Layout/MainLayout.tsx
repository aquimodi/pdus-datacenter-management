import React, { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import DebugPanel from '../Debug/DebugPanel';

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  lastUpdated: Date | null;
  loading: boolean;
  onRefresh: () => void;
  isAutoRefresh: boolean;
  toggleAutoRefresh: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  title,
  lastUpdated,
  loading,
  onRefresh,
  isAutoRefresh,
  toggleAutoRefresh
}) => {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={title}
          lastUpdated={lastUpdated}
          loading={loading}
          onRefresh={onRefresh}
          isAutoRefresh={isAutoRefresh}
          toggleAutoRefresh={toggleAutoRefresh}
        />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
        <DebugPanel />
      </div>
    </div>
  );
};

export default MainLayout;