import React, { useState, useMemo, useEffect } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { AlertTriangle, Filter, ArrowDownToLine, Clock, X, ChevronUp, ChevronDown, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchProblemsData } from '../services/api';
import { Problem } from '../types';

type ProblemType = 'Temperature' | 'Humidity' | 'Power';
type SortField = 'rack' | 'site' | 'dc' | 'type' | 'value' | 'time' | 'severity' | 'currentValue' | 'threshold' | 'id';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  problemType: string;
  datacenter: string;
  timeframe: 'current' | 'historical';
}

const ProblemsPage: React.FC = () => {
  const { user } = useAuth();
  
  const [filters, setFilters] = useState<FilterState>({
    problemType: '',
    datacenter: '',
    timeframe: 'current'
  });
  
  const [sortConfig, setSortConfig] = useState<{
    field: SortField;
    direction: SortDirection;
  }>({
    field: 'time',
    direction: 'desc'
  });
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [currentProblems, setCurrentProblems] = useState<Problem[]>([]);
  const [historicalProblems, setHistoricalProblems] = useState<Problem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  
  // Function to fetch problems data from API
  const fetchProblems = async (isHistorical: boolean) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchProblemsData(isHistorical);
      
      if (response.status === "Success") {
        if (isHistorical) {
          setHistoricalProblems(response.data);
        } else {
          setCurrentProblems(response.data);
        }
        setLastUpdated(new Date());
      } else {
        setError(`Failed to fetch ${isHistorical ? 'historical' : 'current'} problems`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch data on component mount and when timeframe changes
  useEffect(() => {
    const fetchAllProblems = async () => {
      await fetchProblems(false); // Current problems
      await fetchProblems(true);  // Historical problems
    };
    
    fetchAllProblems();
    
    // Set up auto-refresh if enabled
    if (isAutoRefresh) {
      const interval = setInterval(() => {
        fetchProblems(filters.timeframe === 'historical');
      }, 30000); // Refresh every 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [filters.timeframe, isAutoRefresh]);

  // Get unique values for filters
  const uniqueDatacenters = useMemo(() => {
    const allProblems = [...currentProblems, ...historicalProblems];
    return [...new Set(allProblems.map(p => `${p.site} - ${p.dc}`))];
  }, [currentProblems, historicalProblems]);

  const problemTypes: ProblemType[] = ['Temperature', 'Humidity', 'Power'];

  // Filter and sort problems
  const filteredProblems = useMemo(() => {
    let problems = filters.timeframe === 'current' ? currentProblems : historicalProblems;
    
    if (filters.problemType) {
      problems = problems.filter(p => p.type === filters.problemType);
    }
    
    if (filters.datacenter) {
      const [site, dc] = filters.datacenter.split(' - ');
      problems = problems.filter(p => p.site === site && p.dc === dc);
    }
    
    return problems.sort((a, b) => {
      const getValue = (problem: any) => {
        switch (sortConfig.field) {
          case 'rack': return problem.rack;
          case 'id': return problem.id;
          case 'site': return problem.site;
          case 'dc': return problem.dc;
          case 'severity': return problem.severity;
          case 'type': return problem.type;
          case 'currentValue': return parseFloat(problem.currentValue || '0');
          case 'value': return parseFloat(problem.value || '0');
          case 'threshold': return parseFloat(problem.threshold || '0');
          case 'time': return new Date(problem.time).getTime();
          default: return '';
        }
      };
      
      const aValue = getValue(a);
      const bValue = getValue(b);
      
      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [filters, sortConfig, currentProblems, historicalProblems]);

  const handleSort = (field: SortField) => {
    setSortConfig(current => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const clearFilters = () => {
    setFilters({
      problemType: '',
      datacenter: '',
      timeframe: 'current'
    });
  };

  const handleRefresh = () => {
    fetchProblems(filters.timeframe === 'historical');
  };

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(prev => !prev);
  };

  const handleExport = () => {
    const csvContent = [
      // Headers
      ['Rack', 'Location', 'Type', 'Value', 'Threshold', 'Time', 'Resolved'].join(','),
      // Data
      ...filteredProblems.map(p => [
        p.rack,
        `${p.site} - ${p.dc}`,
        p.type,
        p.value,
        p.threshold,
        p.time,
        p.resolved || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `problems-${filters.timeframe}-${new Date().toISOString()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) {
      return <div className="w-4" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp size={16} className="text-indigo-600" /> : 
      <ChevronDown size={16} className="text-indigo-600" />;
  };

  return (
    <MainLayout
      title="Problems Management"
      lastUpdated={lastUpdated}
      loading={loading}
      onRefresh={handleRefresh}
      isAutoRefresh={isAutoRefresh}
      toggleAutoRefresh={toggleAutoRefresh}
    >
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            Error: {error}
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-md">
          <div className="flex justify-between items-center p-6">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center">
              <AlertTriangle size={22} className="text-yellow-500 mr-2" />
              Problem Dashboard
            </h2>
            <button 
              onClick={handleExport}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-800 rounded-md flex items-center"
            >
              <ArrowDownToLine size={16} className="mr-1" />
              Export
            </button>
          </div>
          
          <div className="px-6 pb-4">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Filter size={20} className="text-gray-500 mr-2" />
                  <h3 className="text-lg font-medium text-gray-700">Filters</h3>
                  {(filters.problemType || filters.datacenter || filters.timeframe !== 'current') && (
                    <>
                      <span className="text-sm text-gray-500">•</span>
                      <button
                        onClick={clearFilters}
                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
                      >
                        <XCircle size={16} className="mr-1" />
                        Clear Filters
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <ChevronDown
                      size={20}
                      className={`transform transition-transform ${isFiltersExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>
              
              <div className={`mt-4 ${isFiltersExpanded ? '' : 'hidden'}`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Time Frame
                    </label>
                    <div className="relative">
                      <select
                        value={filters.timeframe}
                        onChange={(e) => setFilters(prev => ({ ...prev, timeframe: e.target.value as 'current' | 'historical' }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 pl-3 pr-10 py-2 appearance-none bg-white"
                      >
                        <option value="current">Current Problems</option>
                        <option value="historical">Historical Problems</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Problem Type
                    </label>
                    <div className="relative">
                      <select
                        value={filters.problemType}
                        onChange={(e) => setFilters(prev => ({ ...prev, problemType: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 pl-3 pr-10 py-2 appearance-none bg-white"
                      >
                        <option value="">All Types</option>
                        {problemTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Datacenter
                    </label>
                    <div className="relative">
                      <select
                        value={filters.datacenter}
                        onChange={(e) => setFilters(prev => ({ ...prev, datacenter: e.target.value }))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 pl-3 pr-10 py-2 appearance-none bg-white"
                      >
                        <option value="">All Datacenters</option>
                        {uniqueDatacenters.map(dc => (
                          <option key={dc} value={dc}>{dc}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
                
                {(filters.timeframe !== 'current' || filters.problemType || filters.datacenter) && (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="text-sm text-gray-500 flex items-center flex-wrap gap-2">
                      Active filters:
                      {filters.timeframe !== 'current' && (
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                          Historical
                        </span>
                      )}
                      {filters.problemType && (
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                          {filters.problemType}
                        </span>
                      )}
                      {filters.datacenter && (
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                          {filters.datacenter}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {filteredProblems.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('rack')}
                    >
                      <div className="flex items-center">
                        Rack
                        <SortIcon field="rack" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('site')}
                    >
                      <div className="flex items-center">
                        Location
                        <SortIcon field="site" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('severity')}
                    >
                      <div className="flex items-center">
                        Severity
                        <SortIcon field="severity" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center">
                        Type
                        <SortIcon field="type" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('currentValue')}
                    >
                      <div className="flex items-center">
                        Current Value
                        <SortIcon field="currentValue" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('value')}
                    >
                      <div className="flex items-center">
                        Alert Value
                        <SortIcon field="value" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('threshold')}
                    >
                      <div className="flex items-center">
                        Threshold
                        <SortIcon field="threshold" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('time')}
                    >
                      <div className="flex items-center">
                        Time
                        <SortIcon field="time" />
                      </div>
                    </th>
                    {filters.timeframe === 'historical' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Resolved
                      </th>
                    )}
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('id')}
                    >
                      <div className="flex items-center">
                        Problem ID
                        <SortIcon field="id" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProblems.map((problem) => (
                    <tr key={problem.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{problem.rack}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{problem.site} - {problem.dc}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${
                            problem.severity === 'High' ? 'bg-red-500' :
                            problem.severity === 'Medium' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`} />
                          <span className="text-sm text-gray-600">{problem.severity}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          problem.type === 'Temperature' ? 'bg-red-100 text-red-800' :
                          problem.type === 'Humidity' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {problem.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{problem.currentValue}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{problem.value}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{problem.threshold}</td>
                      <td className="px-6 py-4 whitespace-nowrap flex items-center">
                        <Clock size={14} className="text-gray-400 mr-1" />
                        <span className="text-sm text-gray-500">{problem.time}</span>
                      </td>
                      {filters.timeframe === 'historical' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Clock size={14} className="text-gray-400 mr-1 inline" />
                          <span className="text-sm text-gray-500">{problem.resolved}</span>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <a
                          href={`https://external-system/problems/${problem.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-900 font-medium text-sm flex items-center"
                        >
                          {problem.id}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No problems found matching the current filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProblemsPage;