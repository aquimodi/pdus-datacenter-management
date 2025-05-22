# DC Operations Manager

A comprehensive datacenter operations management application for monitoring temperature, humidity, and power consumption in real-time.

## Deployment Architecture

This application consists of two main parts:
1. Frontend (React application)
2. Backend (Node.js Express API)

These components can be deployed together on a single server or separately on different servers.

## Deployment Options

### Option 1: Single Server Deployment
Both frontend and backend run on the same server.

1. Set `SERVE_FRONTEND=true` in `server/.env`
2. Start the application using PM2: `npm run start:pm2`

### Option 2: Separate Servers Deployment (Recommended)
Frontend and backend run on different servers.

#### Backend Server:
1. Set `SERVE_FRONTEND=false` in `server/.env`
2. Set `BIND_ADDRESS` to the server's service IP in `server/.env` and `ecosystem.config.cjs`
3. Start the backend using PM2: `npm run start:pm2`

#### Frontend Server:
1. Build the frontend: `npm run build`
2. Update the `.env` file to point `VITE_LOCAL_SERVER_URL` to the backend server's address
3. Serve the static files from the `dist` directory using a web server (Nginx, Apache, etc.)

## Setup for Windows Server Deployment

### Prerequisites

- Node.js 18+ (https://nodejs.org/)
- npm 8+ (comes with Node.js)
- Microsoft SQL Server

### Installation Steps

#### 1. Clone or Download the Application

Download or clone this repository to your Windows Server.

#### 2. Install Dependencies

```
npm install
```

#### 3. Configure Environment Variables

Copy the example environment files and update them with your actual configuration:

```
copy .env.example .env
copy server.env.example server/.env
```

Edit both `.env` and `server/.env` files to set the correct database credentials and other configuration options.

#### 4. Build the Frontend

```
npm run build
```

This will create a `dist` directory with the compiled frontend files.

#### 5. Set Up PM2 Service Manager

Install PM2 globally and configure the application to run as a Windows service:

```
# Install PM2 globally
npm install -g pm2

# Start application using the ecosystem.config.cjs configuration
npm run start:pm2
# (Alternatively: pm2 start ecosystem.config.cjs)

# Configure PM2 to start on system boot
npm run setup:pm2
# (This combines the "pm2 startup" and "pm2 save" commands)
```

This will:
- Install PM2 globally
- Start the application server using the configuration in ecosystem.config.cjs
- Configure PM2 to automatically restart on system boot
- Save the current process configuration

### Service Management

The application is managed using pm2:

- Start: `pm2 start dcops-api`
- Stop: `pm2 stop dcops-api`
- Restart: `pm2 restart dcops-api`
- Status: `pm2 status`
- Monitor: `pm2 monit`

For convenience, the following npm scripts are available:
- `npm run start:pm2` - Start the application with PM2
- `npm run stop:pm2` - Stop the application
- `npm run restart:pm2` - Restart the application

### Logs

Logs are stored in the `logs` directory and managed by pm2:

- View logs: `pm2 logs dcops-api`
- Flush logs: `pm2 flush dcops-api`
- View logs location: `pm2 logs --path`

Standard logs are in:
- `combined.log` - All logs
- `error.log` - Error logs only

## Development Mode

For local development:

1. Start the backend server:
```
npm run server:dev
```

2. Start the frontend development server:
```
npm run dev
```

## Database Schema

The application uses the following database tables:
- `racks` - Information about datacenter racks
- `sensor_readings` - Historical sensor data
- `problems` - Current and historical alerts/problems

SQL scripts for creating these tables are located in the `supabase/migrations` directory.

## License

All rights reserved.