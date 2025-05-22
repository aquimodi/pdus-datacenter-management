import React from 'react';
import { DatacenterGroup } from '../../types';
import RackCard from './RackCard';

interface DatacenterSectionProps {
  group: DatacenterGroup;
}

const DatacenterSection: React.FC<DatacenterSectionProps> = ({ group }) => {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          {group.site} - {group.dc}
        </h2>
        <p className="text-sm text-gray-500">
          {group.racks.length} racks
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {group.racks.map((rack) => (
          <RackCard key={rack.id} rack={rack as any} />
        ))}
      </div>
    </div>
  );
};

export default DatacenterSection;