import { v4 as uuidv4 } from 'uuid';

export const mockSensorData = {
  "status": "Success",
  "data": [
    {
      "id": "1",
      "id_v1": "1",
      "site_id": "4",
      "plan_id": "1",
      "NAME": "BA00173",
      "SITE": "Barcelona",
      "DC": "IT1",
      "MAINTENANCE": "0",
      "MAXPOWER": "7",
      "MAXU": "47",
      "FREEU": "47",
      "TOTAL_VOLTS": null,
      "TOTAL_AMPS": null,
      "TOTAL_WATTS": null,
      "TOTAL_KW": null,
      "TOTAL_KWH": null,
      "TOTAL_VA": null,
      "TOTAL_PF": null,
      "L1_VOLTS": null,
      "L2_VOLTS": null,
      "L3_VOLTS": null,
      "L1_WATTS": null,
      "L2_WATTS": null,
      "L3_WATTS": null,
      "L1_KW": null,
      "L2_KW": null,
      "L3_KW": null,
      "L1_KWH": null,
      "L2_KWH": null,
      "L3_KWH": null,
      "L1_PF": null,
      "L2_PF": null,
      "L3_PF": null,
      "L1_VA": null,
      "L2_VA": null,
      "L3_VA": null,
      "phase": "Single Phase"
    },
    {
      "id": "2",
      "id_v1": "2",
      "site_id": "4",
      "plan_id": "1",
      "NAME": "BA02276",
      "SITE": "Barcelona",
      "DC": "IT1",
      "MAINTENANCE": "0",
      "MAXPOWER": "7",
      "MAXU": "42",
      "FREEU": "42",
      "TOTAL_VOLTS": "228.22",
      "TOTAL_AMPS": "20.01",
      "TOTAL_WATTS": "4362.00",
      "TOTAL_KW": "4.362000",
      "TOTAL_KWH": "419903.30",
      "TOTAL_VA": "4564.00",
      "TOTAL_PF": "0.95",
      "L1_VOLTS": "228.22",
      "L2_VOLTS": null,
      "L3_VOLTS": null,
      "L1_WATTS": "4362.00",
      "L2_WATTS": null,
      "L3_WATTS": null,
      "L1_KW": "4.362000",
      "L2_KW": null,
      "L3_KW": null,
      "L1_KWH": "419903.30",
      "L2_KWH": null,
      "L3_KWH": null,
      "L1_PF": "0.95",
      "L2_PF": null,
      "L3_PF": null,
      "L1_VA": "4564.00",
      "L2_VA": null,
      "L3_VA": null,
      "phase": "Single Phase"
    },
    {
      "id": "3",
      "id_v1": "3",
      "site_id": "4",
      "plan_id": "1",
      "NAME": "MA02292",
      "SITE": "Madrid",
      "DC": "IT1",
      "MAINTENANCE": "0",
      "MAXPOWER": "7",
      "MAXU": "42",
      "FREEU": "42",
      "TOTAL_VOLTS": "227.32",
      "TOTAL_AMPS": "22.62",
      "TOTAL_WATTS": "5010.00",
      "TOTAL_KW": "5.010000",
      "TOTAL_KWH": "456846.10",
      "TOTAL_VA": "5145.00",
      "TOTAL_PF": "0.97",
      "L1_VOLTS": "227.32",
      "L2_VOLTS": null,
      "L3_VOLTS": null,
      "L1_WATTS": "5010.00",
      "L2_WATTS": null,
      "L3_WATTS": null,
      "L1_KW": "5.010000",
      "L2_KW": null,
      "L3_KW": null,
      "L1_KWH": "456846.10",
      "L2_KWH": null,
      "L3_KWH": null,
      "L1_PF": "0.97",
      "L2_PF": null,
      "L3_PF": null,
      "L1_VA": "5145.00",
      "L2_VA": null,
      "L3_VA": null,
      "phase": "Single Phase"
    },
    {
      "id": "4",
      "id_v1": "4",
      "site_id": "4",
      "plan_id": "1",
      "NAME": "MA00184",
      "SITE": "Madrid",
      "DC": "IT2",
      "MAINTENANCE": "0",
      "MAXPOWER": "7",
      "MAXU": "42",
      "FREEU": "12",
      "TOTAL_VOLTS": "229.12",
      "TOTAL_AMPS": "18.25",
      "TOTAL_WATTS": "4050.00",
      "TOTAL_KW": "4.050000",
      "TOTAL_KWH": "324756.80",
      "TOTAL_VA": "4180.00",
      "TOTAL_PF": "0.96",
      "L1_VOLTS": "229.12",
      "L2_VOLTS": null,
      "L3_VOLTS": null,
      "L1_WATTS": "4050.00",
      "L2_WATTS": null,
      "L3_WATTS": null,
      "L1_KW": "4.050000",
      "L2_KW": null,
      "L3_KW": null,
      "L1_KWH": "324756.80",
      "L2_KWH": null,
      "L3_KWH": null,
      "L1_PF": "0.96",
      "L2_PF": null,
      "L3_PF": null,
      "L1_VA": "4180.00",
      "L2_VA": null,
      "L3_VA": null,
      "phase": "Single Phase"
    },
    {
      "id": "5",
      "id_v1": "5",
      "site_id": "6",
      "plan_id": "2",
      "NAME": "VA00432",
      "SITE": "Valencia",
      "DC": "IT3",
      "MAINTENANCE": "1",
      "MAXPOWER": "10",
      "MAXU": "48",
      "FREEU": "8",
      "TOTAL_VOLTS": "230.45",
      "TOTAL_AMPS": "32.17",
      "TOTAL_WATTS": "7250.00",
      "TOTAL_KW": "7.250000",
      "TOTAL_KWH": "586432.20",
      "TOTAL_VA": "7412.00",
      "TOTAL_PF": "0.98",
      "L1_VOLTS": "230.45",
      "L2_VOLTS": "232.15",
      "L3_VOLTS": "229.85",
      "L1_WATTS": "2350.00",
      "L2_WATTS": "2450.00",
      "L3_WATTS": "2450.00",
      "L1_KW": "2.350000",
      "L2_KW": "2.450000",
      "L3_KW": "2.450000",
      "L1_KWH": "192532.20",
      "L2_KWH": "195900.00",
      "L3_KWH": "198000.00",
      "L1_PF": "0.98",
      "L2_PF": "0.97",
      "L3_PF": "0.98",
      "L1_VA": "2398.00",
      "L2_VA": "2525.00",
      "L3_VA": "2489.00",
      "phase": "3-Phase"
    }
  ]
};

// Mock problems data
export const mockProblemsData = {
  current: [
    { 
      id: 'P-20250315-001', 
      rack: 'BA02276', 
      site: 'Barcelona', 
      dc: 'IT1', 
      type: 'Temperature', 
      value: '33.5°C', 
      currentValue: '32.8°C', 
      threshold: '32°C', 
      time: '2025-03-15 14:23:45', 
      severity: 'High', 
      status: 'active',
      alert_type: 'high'
    },
    { 
      id: 'P-20250315-002', 
      rack: 'MA02292', 
      site: 'Madrid', 
      dc: 'IT1', 
      type: 'Humidity', 
      value: '72%', 
      currentValue: '68%', 
      threshold: '70%', 
      time: '2025-03-15 13:45:12', 
      severity: 'Medium', 
      status: 'active',
      alert_type: 'high'
    },
    { 
      id: 'P-20250315-003', 
      rack: 'VA00432', 
      site: 'Valencia', 
      dc: 'IT3', 
      type: 'Power', 
      value: '17.3A', 
      currentValue: '16.8A', 
      threshold: '16A', 
      time: '2025-03-15 12:30:01', 
      severity: 'Low', 
      status: 'active',
      alert_type: 'high'
    },
    { 
      id: 'P-20250315-004', 
      rack: 'MA00184', 
      site: 'Madrid', 
      dc: 'IT2', 
      type: 'Temperature', 
      value: '16.2°C', 
      currentValue: '17.1°C', 
      threshold: '18°C', 
      time: '2025-03-15 11:15:30', 
      severity: 'Medium', 
      status: 'active',
      alert_type: 'low'
    },
    { 
      id: 'P-20250315-005', 
      rack: 'BA00173', 
      site: 'Barcelona', 
      dc: 'IT1', 
      type: 'Humidity', 
      value: '37%', 
      currentValue: '38.5%', 
      threshold: '40%', 
      time: '2025-03-15 10:05:22', 
      severity: 'Low', 
      status: 'active',
      alert_type: 'low'
    }
  ],
  historical: [
    { 
      id: 'P-20250314-001', 
      rack: 'BA02276', 
      site: 'Barcelona', 
      dc: 'IT1', 
      type: 'Temperature', 
      value: '33.2°C', 
      currentValue: '31.5°C', 
      threshold: '32°C', 
      time: '2025-03-14 10:13:22', 
      resolved: '2025-03-14 11:45:17', 
      severity: 'Medium', 
      status: 'resolved',
      alert_type: 'high'
    },
    { 
      id: 'P-20250313-001', 
      rack: 'MA00184', 
      site: 'Madrid', 
      dc: 'IT2', 
      type: 'Power', 
      value: '18.1A', 
      currentValue: '15.5A', 
      threshold: '16A', 
      time: '2025-03-13 08:22:45', 
      resolved: '2025-03-13 09:30:12', 
      severity: 'High', 
      status: 'resolved',
      alert_type: 'high'
    },
    { 
      id: 'P-20250312-001', 
      rack: 'VA00432', 
      site: 'Valencia', 
      dc: 'IT3', 
      type: 'Humidity', 
      value: '38%', 
      currentValue: '41%', 
      threshold: '40%', 
      time: '2025-03-12 14:18:30', 
      resolved: '2025-03-12 16:22:40', 
      severity: 'Low', 
      status: 'resolved',
      alert_type: 'low'
    }
  ]
};

// Mock threshold data
export const mockThresholdsData = {
  "status": "Success",
  "data": [
    {
      "id": "mock-threshold-id",
      "name": "global",
      "min_temp": 18.0,
      "max_temp": 32.0,
      "min_humidity": 40.0,
      "max_humidity": 70.0,
      "max_power_single_phase": 16.0,
      "max_power_three_phase": 48.0,
      "created_at": "2025-05-20T10:00:00.000Z",
      "updated_at": "2025-05-20T10:00:00.000Z"
    }
  ]
};

// Add random temperature and humidity data with alert thresholds
mockSensorData.data.forEach(rack => {
  // Use the new phase field to determine if this is a single-phase rack
  const isSinglePhase = rack.phase === 'Single Phase';
  
  // Temperature: Add values between 18-35°C with threshold at 32°C
  rack.TEMPERATURE = (18 + Math.random() * 17).toFixed(1);
  
  // Humidity: Add values between 40-75% with threshold at 70%
  rack.HUMIDITY = (40 + Math.random() * 35).toFixed(1);
  
  // Generate alert flags based on specified thresholds
  rack.TEMP_ALERT = Number(rack.TEMPERATURE) > 32 || Number(rack.TEMPERATURE) < 18;
  rack.HUMIDITY_ALERT = Number(rack.HUMIDITY) > 70 || Number(rack.HUMIDITY) < 40;
  
  // Power alerts based on phase type using the new phase field:
  // - Single phase: Alert if over 16A
  // - Three phase: Alert if over 48A
  if (isSinglePhase) {
    rack.POWER_ALERT = rack.TOTAL_AMPS && Number(rack.TOTAL_AMPS) > 16;
  } else {
    rack.POWER_ALERT = rack.TOTAL_AMPS && Number(rack.TOTAL_AMPS) > 48;
  }
});