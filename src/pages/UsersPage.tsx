import React from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const UsersPage: React.FC = () => {
  const { user } = useAuth();
  
  // Only allow access if user is an Admin
  if (user?.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }
  
  return (
    <MainLayout
      title="User Management"
      lastUpdated={null}
      loading={false}
      onRefresh={() => {}}
      isAutoRefresh={false}
      toggleAutoRefresh={() => {}}
    >
      <div className="bg-white p-8 rounded-lg shadow-md">
        <div className="flex flex-col items-center justify-center py-12">
          <Users size={48} className="text-purple-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-700 mb-2">User Management</h2>
          <p className="text-gray-500 text-center max-w-md">
            This section will allow administrators to manage user accounts, permissions,
            and roles. This feature will be available in Phase 2.
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default UsersPage;