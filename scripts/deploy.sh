#!/bin/bash

# Deployment script for Class Notes PWA
# Usage: ./scripts/deploy.sh [production|staging]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment
ENV=${1:-production}

echo -e "${GREEN}🚀 Starting deployment for $ENV environment${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command_exists docker-compose; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Load environment variables
if [ -f ".env.$ENV" ]; then
    echo -e "${GREEN}Loading environment variables from .env.$ENV${NC}"
    export $(cat .env.$ENV | xargs)
else
    echo -e "${RED}.env.$ENV file not found!${NC}"
    exit 1
fi

# Build Docker images
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose build --no-cache

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
docker-compose run --rm app npm run migrate

# Stop old containers
echo -e "${YELLOW}Stopping old containers...${NC}"
docker-compose down

# Start new containers
echo -e "${YELLOW}Starting new containers...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Health check
echo -e "${YELLOW}Running health check...${NC}"
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:6001/api/health)

if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ Deployment successful! Application is healthy.${NC}"
else
    echo -e "${RED}❌ Health check failed! HTTP status: $HEALTH_CHECK${NC}"
    echo -e "${YELLOW}Checking logs...${NC}"
    docker-compose logs --tail=50
    exit 1
fi

# Show running containers
echo -e "${GREEN}Running containers:${NC}"
docker-compose ps

# Clean up old images
echo -e "${YELLOW}Cleaning up old images...${NC}"
docker image prune -f

echo -e "${GREEN}🎉 Deployment complete!${NC}"