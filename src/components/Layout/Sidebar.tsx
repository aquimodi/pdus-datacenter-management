import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, Settings, AlertTriangle, Users, LogOut, Database, Server, ChevronLeft, ChevronRight, Info } from 'lucide-react';

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/racks', label: 'Racks', icon: <Server size={20} /> },
    { path: '/problems', label: 'Problems', icon: <AlertTriangle size={20} /> },
    { path: '/server', label: 'Server', icon: <Database size={20} /> },
    // Admin only items
    ...(user?.role === 'Admin' ? [
      { path: '/users', label: 'User Management', icon: <Users size={20} /> }
    ] : [])
  ];

  const handleProductInfo = () => {
    window.location.href = '/';
  };

  return (
    <div className={`h-screen ${isCollapsed ? 'w-16' : 'w-64'} bg-gray-800 text-white flex flex-col transition-all duration-300 relative`}>
      <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
        <Database className="mr-2" size={24} />
        {!isCollapsed && <h1 className="text-xl font-bold">DC Ops Manager</h1>}
      </div>

      <nav className="flex-grow">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`flex items-center py-2 px-4 ${
                  isCollapsed ? 'justify-center' : ''
                } ${
                  isActive(item.path)
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!isCollapsed && <span className="ml-3">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto mb-4">
        <Link
          to="/configuration"
          className={`w-full flex items-center py-2 px-4 ${
            isCollapsed ? 'justify-center' : ''
          } ${
            isActive('/configuration')
              ? 'bg-indigo-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
          title={isCollapsed ? "Settings" : undefined}
        >
          <Settings size={20} />
          {!isCollapsed && <span className="ml-3">Settings</span>}
        </Link>
        
        <button
          onClick={handleProductInfo}
          className={`w-full flex items-center py-2 px-4 ${
            isCollapsed ? 'justify-center' : ''
          } text-gray-300 hover:bg-gray-700`}
          title={isCollapsed ? "Product Info" : undefined}
        >
          <Info size={20} />
          {!isCollapsed && <span className="ml-3">Product Info</span>}
        </button>
      </div>

      <div className={`p-4 border-t border-gray-700 ${isCollapsed ? 'flex justify-center' : ''}`}>
        {!isCollapsed && (
          <button
            onClick={logout}
            className="flex items-center text-gray-300 hover:text-white"
          >
            <LogOut size={18} className="mr-2" />
            <span>Logout</span>
          </button>
        )}
        {isCollapsed && (
          <button
            onClick={logout}
            className="text-gray-300 hover:text-white"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>

      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-1/2 -right-3 bg-gray-800 text-white p-1 rounded-full shadow-lg hover:bg-gray-700"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
};

export default Sidebar;