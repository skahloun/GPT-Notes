#!/bin/bash

# Automated update script for Class Notes PWA
# Performs zero-downtime updates with health checks

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKUP_BEFORE_UPDATE=${BACKUP_BEFORE_UPDATE:-true}
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_DELAY=5

echo -e "${BLUE}🔄 Class Notes PWA Update Script${NC}"
echo -e "${BLUE}================================${NC}"

# Function to check if services are healthy
check_health() {
    local retries=$1
    local delay=$2
    
    for i in $(seq 1 $retries); do
        if curl -s -f http://localhost:6001/api/health > /dev/null; then
            return 0
        fi
        echo -e "${YELLOW}Health check attempt $i/$retries failed, waiting ${delay}s...${NC}"
        sleep $delay
    done
    return 1
}

# 1. Check current version
echo -e "\n${YELLOW}📌 Current version:${NC}"
CURRENT_VERSION=$(git describe --tags --always)
echo "Version: $CURRENT_VERSION"
echo "Commit: $(git rev-parse --short HEAD)"

# 2. Create backup
if [ "$BACKUP_BEFORE_UPDATE" = "true" ]; then
    echo -e "\n${YELLOW}💾 Creating backup...${NC}"
    ./scripts/backup.sh
fi

# 3. Fetch latest changes
echo -e "\n${YELLOW}📥 Fetching latest changes...${NC}"
git fetch origin

# Check if there are updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}✅ Already up to date!${NC}"
    exit 0
fi

# Show what will be updated
echo -e "\n${YELLOW}📋 Changes to be applied:${NC}"
git log --oneline HEAD..origin/main

# 4. Stash any local changes
if ! git diff-index --quiet HEAD --; then
    echo -e "\n${YELLOW}📦 Stashing local changes...${NC}"
    git stash save "Before update $(date +%Y%m%d_%H%M%S)"
fi

# 5. Pull latest code
echo -e "\n${YELLOW}📥 Pulling latest code...${NC}"
git pull origin main

# 6. Check for dependency updates
echo -e "\n${YELLOW}📦 Checking dependencies...${NC}"
if git diff HEAD~1 HEAD --name-only | grep -q "package.json"; then
    echo "Package.json changed, installing dependencies..."
    npm install
    npm run build
fi

# 7. Check for database migrations
echo -e "\n${YELLOW}🗄️ Checking for database migrations...${NC}"
if [ -d "migrations" ] && [ "$(ls -A migrations 2>/dev/null)" ]; then
    echo "Running database migrations..."
    docker-compose run --rm app npm run migrate:up
fi

# 8. Build new Docker images
echo -e "\n${YELLOW}🏗️ Building Docker images...${NC}"
docker-compose build

# 9. Get running container IDs
OLD_APP_CONTAINER=$(docker-compose ps -q app)

# 10. Start new containers (rolling update)
echo -e "\n${YELLOW}🚀 Starting new containers...${NC}"
docker-compose up -d --no-deps --scale app=2 app

# Wait for new container to be healthy
echo -e "\n${YELLOW}🏥 Waiting for new container to be healthy...${NC}"
sleep 10

if ! check_health $HEALTH_CHECK_RETRIES $HEALTH_CHECK_DELAY; then
    echo -e "${RED}❌ New container failed health check!${NC}"
    echo -e "${YELLOW}Rolling back...${NC}"
    docker-compose down
    git checkout HEAD~1
    docker-compose up -d
    exit 1
fi

# 11. Stop old container
echo -e "\n${YELLOW}🛑 Stopping old container...${NC}"
if [ ! -z "$OLD_APP_CONTAINER" ]; then
    docker stop $OLD_APP_CONTAINER
    docker rm $OLD_APP_CONTAINER
fi

# Scale back to normal
docker-compose up -d --no-deps --scale app=1 app

# 12. Update nginx if config changed
if git diff HEAD~1 HEAD --name-only | grep -q "nginx"; then
    echo -e "\n${YELLOW}🔄 Updating nginx configuration...${NC}"
    docker-compose restart nginx
fi

# 13. Clean up
echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
docker image prune -f

# 14. Run post-update checks
echo -e "\n${YELLOW}🔍 Running post-update checks...${NC}"

# Check all services are running
SERVICES_STATUS=$(docker-compose ps --services --filter "status=running" | wc -l)
EXPECTED_SERVICES=3 # app, db, nginx

if [ "$SERVICES_STATUS" -ne "$EXPECTED_SERVICES" ]; then
    echo -e "${RED}❌ Not all services are running!${NC}"
    docker-compose ps
    exit 1
fi

# Final health check
if ! check_health 3 5; then
    echo -e "${RED}❌ Post-update health check failed!${NC}"
    exit 1
fi

# 15. Show update summary
echo -e "\n${GREEN}✅ Update completed successfully!${NC}"
echo -e "${GREEN}================================${NC}"
NEW_VERSION=$(git describe --tags --always)
echo -e "Previous version: ${CURRENT_VERSION}"
echo -e "New version: ${NEW_VERSION}"
echo -e "\n${YELLOW}📊 Service Status:${NC}"
docker-compose ps

# 16. Show recent logs
echo -e "\n${YELLOW}📜 Recent application logs:${NC}"
docker-compose logs --tail=20 app

echo -e "\n${BLUE}💡 Tip: Monitor the application with:${NC}"
echo -e "  docker-compose logs -f app"
echo -e "  pm2 monit"
echo -e "\n${GREEN}🎉 Update complete!${NC}"