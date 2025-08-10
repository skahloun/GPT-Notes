#!/bin/bash

# Backup script for Class Notes PWA
# Creates backups of database and transcripts

set -e

# Configuration
BACKUP_DIR="/backups/class-notes-pwa"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 Starting backup...${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
echo -e "${YELLOW}Backing up database...${NC}"
if [ -f ".env.production" ]; then
    source .env.production
    
    if [[ $DATABASE_URL == postgres* ]]; then
        # PostgreSQL backup
        DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
        docker-compose exec -T db pg_dump -U postgres $DB_NAME | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
    else
        # SQLite backup
        cp class-notes.db "$BACKUP_DIR/db_${TIMESTAMP}.sqlite"
    fi
else
    echo -e "${RED}No production environment file found${NC}"
    exit 1
fi

# Backup transcripts
echo -e "${YELLOW}Backing up transcripts...${NC}"
tar -czf "$BACKUP_DIR/transcripts_${TIMESTAMP}.tar.gz" transcripts/

# Backup environment file (without secrets)
echo -e "${YELLOW}Backing up environment configuration...${NC}"
grep -v -E "(SECRET|PASSWORD|KEY)" .env.production > "$BACKUP_DIR/env_${TIMESTAMP}.txt"

# Remove old backups
echo -e "${YELLOW}Removing old backups (older than $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete

# List recent backups
echo -e "${GREEN}Recent backups:${NC}"
ls -lh "$BACKUP_DIR" | tail -n 10

# Calculate backup size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo -e "${GREEN}✅ Backup complete! Total backup size: $BACKUP_SIZE${NC}"

# Optional: Upload to S3
if [ ! -z "$AWS_BACKUP_BUCKET" ]; then
    echo -e "${YELLOW}Uploading to S3...${NC}"
    aws s3 sync "$BACKUP_DIR" "s3://$AWS_BACKUP_BUCKET/class-notes-backups/" \
        --exclude "*" \
        --include "*_${TIMESTAMP}*"
    echo -e "${GREEN}✅ S3 upload complete!${NC}"
fi