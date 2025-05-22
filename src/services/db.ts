import sql from 'mssql';

const config = {
  user: process.env.VITE_SQL_USER,
  password: process.env.VITE_SQL_PASSWORD,
  server: process.env.VITE_SQL_SERVER || 'localhost',
  database: process.env.VITE_SQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

// Create a connection pool
const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

// Handle pool errors
pool.on('error', err => {
  console.error('SQL Pool Error:', err);
});

export async function executeQuery<T>(query: string, params: any[] = []): Promise<T[]> {
  try {
    await poolConnect;
    const request = pool.request();
    
    // Add parameters if any
    params.forEach((param, index) => {
      request.input(`param${index}`, param);
    });
    
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

// Example queries
export async function getRacks() {
  const query = `
    SELECT 
      id,
      name AS NAME,
      site AS SITE,
      datacenter AS DC,
      maintenance AS MAINTENANCE,
      max_power AS MAXPOWER,
      created_at,
      updated_at
    FROM racks
  `;
  return executeQuery(query);
}

export async function getSensorReadings() {
  const query = `
    SELECT 
      sr.id,
      r.name AS RACK_NAME,
      r.site AS SITE,
      r.datacenter AS DC,
      sr.temperature AS TEMPERATURE,
      sr.humidity AS HUMIDITY,
      sr.total_power AS TOTAL_KW,
      sr.created_at
    FROM sensor_readings sr
    JOIN racks r ON r.id = sr.rack_id
    WHERE sr.created_at >= DATEADD(MINUTE, -5, GETDATE())
  `;
  return executeQuery(query);
}

export async function getProblems(isHistorical: boolean = false) {
  const query = `
    SELECT 
      p.id,
      r.name AS rack,
      r.site,
      r.datacenter AS dc,
      p.type,
      p.value,
      p.threshold,
      p.created_at AS time,
      p.resolved_at AS resolved,
      p.status
    FROM problems p
    JOIN racks r ON r.id = p.rack_id
    WHERE p.status = ${isHistorical ? "'resolved'" : "'active'"}
    ORDER BY p.created_at DESC
  `;
  return executeQuery(query);
}

// Close pool on application shutdown
process.on('SIGINT', () => {
  pool.close();
});

export default {
  executeQuery,
  getRacks,
  getSensorReadings,
  getProblems
};