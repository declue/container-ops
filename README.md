# Container Ops - System Monitoring Dashboard

A modern Next.js-based system monitoring dashboard for containerized environments. Provides real-time CPU, memory, storage, and process monitoring with beautiful visualizations.

## Features

- **Real-time Monitoring**: Track CPU, memory, and storage usage in real-time
- **Process Tracking**: Monitor individual processes with detailed metrics
- **Beautiful Dashboard**: Modern, responsive UI with dark mode support
- **Admin Panel**: Secure admin interface for managing visibility, metrics, and settings
- **Cgroup Support**: Works with both cgroups v1 and v2
- **Historical Data**: Store and visualize metrics over time using Redis
- **Automated Collection**: Background cron job collects metrics every 5 seconds
- **Customizable Views**: Control which metrics and data are visible to users

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS 4
- **Charts**: Recharts
- **Icons**: Lucide React
- **Backend**: Node.js, ioredis
- **Scheduling**: node-cron

## Prerequisites

- Node.js 20+
- Redis server (for metrics storage)

## Getting Started

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd container-ops
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure:
   ```env
   REDIS_URL=redis://localhost:6379
   PROC_MODE=all  # Options: all, user, user+root
   PROC_MAX=8192
   ```

4. **Start Redis** (if not already running):
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:alpine

   # Or using system package manager
   redis-server
   ```

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. **Open the application**:
   - Main page: [http://localhost:3000](http://localhost:3000)
   - Monitoring dashboard: [http://localhost:3000/monitoring](http://localhost:3000/monitoring)
   - Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)

## Configuration

### Environment Variables

- `REDIS_URL`: Redis connection URL (required)
- `ADMIN_PASSWORD`: Admin panel password (optional)
  - If not set, a random password will be generated and displayed in container logs
  - Check logs with: `docker logs container-ops-app`
- `PROC_MODE`: Process monitoring mode
  - `all`: Monitor all processes (default)
  - `user`: Monitor current user's processes only
  - `user+root`: Monitor current user and root processes
- `PROC_UIDS`: Comma-separated list of UIDs to monitor (overrides PROC_MODE)
- `PROC_MAX`: Maximum number of processes to track (default: 8192)

## Project Structure

```
container-ops/
├── app/
│   ├── api/
│   │   └── metrics/
│   │       └── route.ts       # Metrics API endpoint
│   ├── monitoring/
│   │   └── page.tsx           # Monitoring dashboard
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Home page
│   └── globals.css            # Global styles
├── lib/
│   ├── redis.ts               # Redis client configuration
│   └── cron.ts                # Metrics collection cron job
├── instrumentation.ts         # Next.js instrumentation hook
└── .env.example               # Environment variables template
```

## Building for Production

```bash
npm run build
npm start
```

## Docker Deployment

### Quick Start with Docker Compose

1. **Production build with resource limits**:
   ```bash
   docker-compose up -d
   ```

   This will start the application with:
   - **CPU limit**: 2.0 cores
   - **Memory limit**: 1GB
   - **Redis**: Included automatically

2. **Development mode with resource limits**:
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

3. **Access the application**:
   - Dashboard: http://localhost:3000/monitoring
   - Check resource limits in the dashboard header

### Testing Different Resource Configurations

Use the provided test script to experiment with different resource limits:

```bash
./scripts/test-resources.sh
```

This will cycle through different CPU and memory configurations:
- Very Low: 0.5 CPU, 256MB RAM
- Low: 1.0 CPU, 512MB RAM
- Medium: 2.0 CPU, 1GB RAM
- High: 4.0 CPU, 2GB RAM

### Stress Testing

To test the monitoring dashboard under load, run the stress test script inside the container:

```bash
# Enter the container
docker exec -it container-ops-app sh

# Run stress test
/app/scripts/stress-test.sh
```

Or from your host machine:

```bash
# CPU stress
docker exec -d container-ops-app sh -c "while true; do :; done"

# Memory stress (spawn processes)
docker exec -d container-ops-app sh -c "for i in {1..50}; do sleep 1000 & done"
```

### Custom Resource Limits

Edit `docker-compose.yml` to set custom limits:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.5'          # Your desired CPU limit
      memory: 768M         # Your desired memory limit
```

### Manual Docker Build

```bash
# Build the image
docker build -t container-ops .

# Run with resource limits
docker run -d \
  --name container-ops-app \
  --cpus="2.0" \
  --memory="1g" \
  -p 3000:3000 \
  -e REDIS_URL=redis://your-redis-host:6379 \
  container-ops
```

## Features in Detail

### Metrics Collection

The application automatically collects system metrics every 5 seconds:
- CPU usage (container-aware)
- Memory usage (container-aware)
- Storage usage
- Process-level metrics (CPU, memory, command, UID, etc.)

### Dashboard Features

- Real-time charts for CPU, memory, and storage trends
- Top CPU and memory consuming processes
- Searchable and sortable process table
- Dark mode support
- CSV export functionality
- Auto-refresh with configurable intervals

### Admin Panel Features

Access the admin panel at `/admin` to manage your monitoring service:

**Authentication**
- Secure password-based login
- Auto-generated password displayed in logs if not configured
- Session management with 24-hour expiry

**Visibility Controls**
- Toggle visibility of CPU, memory, and storage charts
- Show/hide process list (useful for sensitive environments)
- Control top processes display
- Toggle debug information

**Metrics Management**
- View current metrics storage size
- See storage projections (daily/weekly/monthly)
- Adjust collection interval (1-3600 seconds)
- Clear all metrics cache with one click

**Getting Admin Password**
```bash
# If ADMIN_PASSWORD not set, check container logs for generated password
docker logs container-ops-app | grep "Admin Password"

# Or set your own password
docker-compose down
echo "ADMIN_PASSWORD=your-secure-password" >> .env
docker-compose up -d
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
