#!/bin/bash
# Script to test different resource configurations

set -e

echo "Container Resource Testing Script"
echo "=================================="
echo ""

# Function to test with specific resources
test_config() {
    local cpus=$1
    local memory=$2
    local name=$3

    echo "Testing configuration: $name"
    echo "  CPU: $cpus cores"
    echo "  Memory: $memory"
    echo ""

    # Update docker-compose.yml with new limits
    cat > docker-compose.test.yml <<EOF
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: container-ops-redis-test
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: container-ops-app-test
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - PROC_MODE=all
      - PROC_MAX=8192
      - NODE_ENV=production
    depends_on:
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '$cpus'
          memory: $memory
        reservations:
          cpus: '0.25'
          memory: 128M
EOF

    docker-compose -f docker-compose.test.yml up -d

    echo "Waiting for services to start..."
    sleep 15

    echo "Container is running. Check http://localhost:3000/monitoring"
    echo "Press Enter to stop and test next configuration..."
    read

    docker-compose -f docker-compose.test.yml down
    echo ""
}

# Test different configurations
echo "Starting resource limit tests..."
echo ""

test_config "0.5" "256M" "Very Low Resources"
test_config "1.0" "512M" "Low Resources"
test_config "2.0" "1G" "Medium Resources"
test_config "4.0" "2G" "High Resources"

echo "All tests completed!"
echo "Check the monitoring dashboard to see how the app detects different resource limits."
