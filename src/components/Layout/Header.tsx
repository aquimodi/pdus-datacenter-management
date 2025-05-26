import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDebug } from '../../context/DebugContext';
import { RefreshCw, Settings, Bug, Server, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  title: string;
  lastUpdated: Date | null;
  loading: boolean;
  onRefresh: () => void;
  isAutoRefresh: boolean;
  toggleAutoRefresh: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  title, 
  lastUpdated, 
  loading, 
  onRefresh, 
  isAutoRefresh, 
  toggleAutoRefresh 
}) => {
  const { user, logout } = useAuth();
  const { isDebugEnabled, toggleDebug } = useDebug();
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  return (
    <header className="bg-gray-800 border-b border-gray-700 h-16 flex items-center justify-between px-6 text-white">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <div className="flex items-center space-x-6">
        {lastUpdated && (
          <div className="text-sm text-gray-300">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          <label className="relative inline-flex items-center cursor-pointer ml-2">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isDebugEnabled}
              onChange={toggleDebug}
            />
            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            <span className="ml-2 text-sm font-medium text-gray-300 flex items-center">
              <Bug size={14} className="mr-1" />
              Debug
            </span>
          </label>
          
          <button
            onClick={toggleAutoRefresh}
            className={`text-xs font-medium px-2 py-1 rounded ${
              isAutoRefresh
                ? 'bg-green-600 text-white'
                : 'bg-gray-600 text-white'
            }`}
          >
            {isAutoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          
          <Link
            to="/configuration"
            className="text-gray-300 hover:text-white p-2"
            title="Settings"
          >
            <Settings size={20} />
          </Link>
          
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              <img
                src={`https://ui-avatars.com/api/?name=${user?.username}&background=6366f1&color=fff`}
                alt={user?.username}
                className="w-8 h-8 rounded-full"
              />
            </button>
            
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                <div className="py-1">
                  <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-200">
                    <div className="font-medium">{user?.username}</div>
                    <div className="text-gray-500">{user?.role}</div>
                  </div>
                  <Link
                    to="/configuration"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Profile Settings
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;