#!/bin/bash
set -e

echo "🏗️  Building Next.js application..."
npm run build

echo "📦 Creating standalone deployment package..."
rm -rf dist-standalone
mkdir -p dist-standalone

# Copy standalone output
echo "  → Copying standalone server..."
cp -r .next/standalone/* dist-standalone/

# Copy static files
echo "  → Copying static assets..."
cp -r .next/static dist-standalone/.next/
cp -r public dist-standalone/

# Create startup script
echo "  → Creating startup script..."
cat > dist-standalone/start.sh <<'EOF'
#!/bin/bash
set -e

# Default configuration
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"

# Check Redis connection
if [ -z "$REDIS_URL" ]; then
    echo "⚠️  REDIS_URL is not set. Using default: redis://localhost:6379"
    export REDIS_URL="redis://localhost:6379"
fi

# Check if Redis is accessible
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    REDIS_HOST=$(echo $REDIS_URL | sed -e 's/redis:\/\///' -e 's/:.*//')
    REDIS_PORT=$(echo $REDIS_URL | grep -oP '(?<=:)\d+' || echo "6379")

    if redis-cli -h $REDIS_HOST -p $REDIS_PORT ping &> /dev/null; then
        echo "✅ Redis is accessible"
    else
        echo "⚠️  Warning: Cannot connect to Redis at $REDIS_URL"
        echo "   Make sure Redis is running before starting the app"
    fi
fi

# Generate admin password if not set
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-16)
    export ADMIN_PASSWORD
    echo "🔑 Generated admin password: $ADMIN_PASSWORD"
    echo "   Save this password - it will not be shown again!"
fi

echo ""
echo "🚀 Starting Container Ops Monitor..."
echo "   URL: http://${HOSTNAME}:${PORT}"
echo "   Admin URL: http://${HOSTNAME}:${PORT}/admin"
echo ""

# Start the server
exec node server.js
EOF

chmod +x dist-standalone/start.sh

# Create README
echo "  → Creating README..."
cat > dist-standalone/README.md <<'EOF'
# Container Ops Monitor - Standalone Deployment

## Quick Start

1. **Ensure Redis is running**:
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 --name redis redis:7-alpine

   # Or install Redis locally
   # Ubuntu/Debian: apt install redis-server
   # RHEL/CentOS: yum install redis
   # macOS: brew install redis
   ```

2. **Configure environment** (optional):
   ```bash
   export REDIS_URL=redis://localhost:6379
   export ADMIN_PASSWORD=your-secure-password
   export PORT=3000
   export PROC_MODE=all
   export PROC_MAX=8192
   ```

3. **Start the application**:
   ```bash
   ./start.sh
   ```

## Environment Variables

- `REDIS_URL` - Redis connection URL (default: redis://localhost:6379)
- `ADMIN_PASSWORD` - Admin panel password (auto-generated if not set)
- `PORT` - Server port (default: 3000)
- `HOSTNAME` - Bind address (default: 0.0.0.0)
- `NODE_ENV` - Environment mode (default: production)
- `PROC_MODE` - Process monitoring mode: "all", "user", "user+root" (default: all)
- `PROC_MAX` - Maximum processes to track (default: 8192)

## Accessing the Application

- **Main Dashboard**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

## Requirements

- Node.js is NOT required (binary is included)
- Redis server (required)
- Linux x64 system

## Stopping the Application

Press `Ctrl+C` or:
```bash
pkill -f "node server.js"
```

## Running as a Service

Create `/etc/systemd/system/container-ops.service`:

```ini
[Unit]
Description=Container Ops Monitor
After=network.target redis.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/dist-standalone
Environment="REDIS_URL=redis://localhost:6379"
Environment="ADMIN_PASSWORD=your-password"
ExecStart=/path/to/dist-standalone/start.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable container-ops
sudo systemctl start container-ops
```
EOF

# Create version info
echo "  → Creating version info..."
cat > dist-standalone/VERSION.txt <<EOF
Container Ops Monitor - Standalone Build
Build Date: $(date)
Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
Node.js: $(node --version)
EOF

echo ""
echo "✅ Standalone package created!"
echo ""
echo "📁 Location: dist-standalone/"
echo "📦 Package size: $(du -sh dist-standalone | cut -f1)"
echo ""
echo "🚀 To deploy:"
echo "   1. Copy dist-standalone/ to your server"
echo "   2. Ensure Redis is running"
echo "   3. Run: ./start.sh"
echo ""
echo "📦 To create tarball:"
echo "   tar -czf container-ops-standalone.tar.gz dist-standalone/"
echo ""
