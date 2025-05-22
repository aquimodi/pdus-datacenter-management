module.exports = {
  apps: [{
    name: "dcops-api",
    script: "server/index.js",
    env: {
      NODE_ENV: "production",
      SERVE_FRONTEND: "false",  // Set to 'false' for backend-only server
      BIND_ADDRESS: "IP_DE_LA_INTERFAZ_DE_SERVICIO" // Replace with actual service IP
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    error_file: "logs/pm2-error.log",
    out_file: "logs/pm2-output.log",
    log_file: "logs/pm2-combined.log",
    time: true,
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    max_restarts: 10,
    restart_delay: 4000,
    env_production: {
      NODE_ENV: "production",
      SERVE_FRONTEND: "false",  // Set to 'false' for backend-only server
      BIND_ADDRESS: "IP_DE_LA_INTERFAZ_DE_SERVICIO" // Replace with actual service IP
    }
  }]
};