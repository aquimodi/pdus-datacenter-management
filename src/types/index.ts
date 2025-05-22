export interface Rack {
  id: string;
  rackId?: string;
  name?: string;
  NAME: string;
  SITE: string;
  DC: string;
  MAINTENANCE: string;
  MAXPOWER: string;
  MAXU: string;
  FREEU: string;
  TOTAL_VOLTS: string | null;
  TOTAL_AMPS: string | null;
  TOTAL_WATTS: string | null;
  TOTAL_KW: string | null;
  TOTAL_KWH: string | null;
  TOTAL_VA: string | null;
  TOTAL_PF: string | null;
  L1_VOLTS: string | null;
  L2_VOLTS: string | null;
  L3_VOLTS: string | null;
  L1_WATTS: string | null;
  L2_WATTS: string | null;
  L3_WATTS: string | null;
  L1_KW: string | null;
  L2_KW: string | null;
  L3_KW: string | null;
  L1_KWH: string | null;
  L2_KWH: string | null;
  L3_KWH: string | null;
  L1_PF: string | null;
  L2_PF: string | null;
  L3_PF: string | null;
  L1_VA: string | null;
  L2_VA: string | null;
  L3_VA: string | null;
  phase?: string; // "Single Phase" or "3-Phase"
}

export interface ApiResponse {
  status: string;
  data: Rack[];
}

export type UserRole = 'Admin' | 'Manager' | 'Operator';

export interface User {
  username: string;
  role: UserRole;
}

export interface DatacenterGroup {
  site: string;
  dc: string;
  racks: Rack[];
}

export interface AppMode {
  isDemoMode: boolean;
}

export interface Sensor {
  id: string;
  nodeId?: string;
  sensorIndex?: string; 
  sensorType?: string;
  rackId?: string;
  name?: string;
  RACK_NAME: string;
  SITE: string;
  DC: string;
  TEMPERATURE: string;
  HUMIDITY: string;
  lastUpdate?: string;
  status?: string;
}

export interface SensorApiResponse {
  status: string;
  data: Sensor[];
}

export interface Problem {
  id: string;
  rack: string;
  site: string;
  dc: string;
  type: string;
  value: string;
  threshold: string;
  time: string;
  resolved?: string;
  status: string;
  severity?: string;
  currentValue?: string;
  alert_type?: 'high' | 'low';
}

export interface ProblemsApiResponse {
  status: string;
  data: Problem[];
}

// New interface for the power endpoint response
export interface PowerData {
  id: number;
  rackId: number;
  name: string;
  site: string;
  dc: string;
  rackName: string;
  phase: string;
  capacityAmps: number;
  capacityKw: number;
  totalVolts: number;
  avgVolts: number;
  totalAmps: number;
  totalWatts: number;
  totalKw: number;
  totalKwh: number;
  totalVa: number;
  totalkVa: number;
  totalPf: number;
  powerFail: number;
  lastUpdate: string;
  rstatus: string;
}

// New interface for the sensor endpoint response
export interface SensorData {
  id: number;
  nodeId: number;
  sensorIndex: number;
  sensorType: string;
  planId: number;
  rackId: number;
  name: string;
  rackName: string;
  site: string;
  dc: string;
  temperature: number;
  humidity: number;
  lastUpdate: string;
  status: string;
}

// Interface for thresholds
export interface Threshold {
  id?: string;
  name: string;
  min_temp: number;
  max_temp: number;
  min_humidity: number;
  max_humidity: number;
  max_power_single_phase: number;
  max_power_three_phase: number;
  updated_at?: string;
  created_at?: string;
}

export interface ThresholdsApiResponse {
  status: string;
  data: Threshold[];
}