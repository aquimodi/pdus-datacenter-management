import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppModeProvider } from './context/AppModeContext';
import { DebugProvider } from './context/DebugContext';
import LoginForm from './components/LoginForm';
import LandingPage from './pages/LandingPage';
import RacksPage from './pages/RacksPage';
import DashboardPage from './pages/DashboardPage';
import ProblemsPage from './pages/ProblemsPage';
import ConfigurationPage from './pages/ConfigurationPage';
import UsersPage from './pages/UsersPage';
import ServerPage from './pages/ServerPage';

// Auth guard component
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated && window.location.pathname !== '/') {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginForm />
      } />
      
      <Route path="/dashboard" element={
        <RequireAuth>
          <DashboardPage />
        </RequireAuth>
      } />
      
      <Route path="/racks" element={
        <RequireAuth>
          <RacksPage />
        </RequireAuth>
      } />
      
      <Route path="/problems" element={
        <RequireAuth>
          <ProblemsPage />
        </RequireAuth>
      } />
      
      <Route path="/configuration" element={
        <RequireAuth>
          <ConfigurationPage />
        </RequireAuth>
      } />
      
      <Route path="/users" element={
        <RequireAuth>
          <UsersPage />
        </RequireAuth>
      } />
      
      <Route path="/server" element={
        <RequireAuth>
          <ServerPage />
        </RequireAuth>
      } />
      
      {/* Redirect all other routes to dashboard */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppModeProvider>
          <DebugProvider>
            <AppRoutes />
          </DebugProvider>
        </AppModeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;