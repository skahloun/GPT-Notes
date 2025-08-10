# 🔄 Update Guide for Class Notes PWA

This guide explains how to safely update your deployed application with new features or bug fixes.

## Update Process Overview

1. **Development** → Test locally
2. **Staging** → Test in production-like environment
3. **Production** → Deploy with zero downtime

## Quick Update (Zero Downtime)

For most updates, use the automated update script:

```bash
./scripts/update.sh
```

This script will:
- Pull latest code from Git
- Build new Docker images
- Run database migrations
- Perform rolling update
- Verify health status

## Manual Update Process

### 1. Backup Current State

Always backup before updating:

```bash
./scripts/backup.sh
```

### 2. Pull Latest Changes

```bash
git pull origin main

# Check what changed
git log --oneline -10
git diff HEAD~1 HEAD --name-only
```

### 3. Review Breaking Changes

Check for:
- Database schema changes
- Environment variable changes
- API endpoint changes
- Dependency updates

### 4. Update Dependencies

```bash
# If package.json changed
npm install

# If new dependencies added
npm run build
```

### 5. Database Migrations

If database schema changed:

```bash
# Create migration file
npm run migrate:create -- add_new_feature

# Run migrations
npm run migrate:up
```

### 6. Deploy Update

```bash
# Build new images
docker-compose build

# Deploy with zero downtime
docker-compose up -d --no-deps --build app

# Verify deployment
docker-compose ps
curl http://localhost:6001/api/health
```

## Update Strategies

### Rolling Update (Recommended)

```bash
# Update one instance at a time
pm2 reload ecosystem.config.js
```

### Blue-Green Deployment

```bash
# Deploy to green environment
docker-compose -f docker-compose.green.yml up -d

# Switch traffic
./scripts/switch-traffic.sh green

# Remove blue environment
docker-compose -f docker-compose.blue.yml down
```

### Canary Deployment

```bash
# Deploy to 10% of traffic
./scripts/canary-deploy.sh 10

# Monitor metrics
./scripts/monitor-canary.sh

# Full rollout or rollback
./scripts/canary-deploy.sh 100  # or 0 for rollback
```

## Version Management

### Semantic Versioning

Follow semantic versioning in `package.json`:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features
- **Patch** (0.0.1): Bug fixes

### Git Tags

```bash
# Tag release
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3

# Deploy specific version
git checkout v1.2.3
./scripts/deploy.sh
```

## Common Update Scenarios

### Frontend Only Update

```bash
# Just rebuild static assets
npm run build
docker-compose restart nginx
```

### Backend API Update

```bash
# Update backend only
docker-compose up -d --no-deps --build app
```

### Database Schema Update

```bash
# Stop application
docker-compose stop app

# Run migrations
docker-compose run --rm app npm run migrate:up

# Start application
docker-compose start app
```

### Environment Variable Update

```bash
# Update .env.production
nano .env.production

# Restart to apply
docker-compose restart app
```

## Rollback Procedures

### Quick Rollback

```bash
# Rollback to previous version
git checkout HEAD~1
./scripts/deploy.sh

# Or use Docker image tags
docker-compose down
docker-compose up -d --no-build
```

### Database Rollback

```bash
# Rollback last migration
npm run migrate:down

# Restore from backup
./scripts/restore-backup.sh 20240110_120000
```

## Update Checklist

Before updating:
- [ ] Review changelog/commits
- [ ] Test in development
- [ ] Backup production data
- [ ] Notify users (if downtime expected)
- [ ] Prepare rollback plan

During update:
- [ ] Monitor application logs
- [ ] Check error rates
- [ ] Verify API responses
- [ ] Test critical features

After update:
- [ ] Verify all services running
- [ ] Check application health
- [ ] Monitor for errors
- [ ] Test user workflows
- [ ] Update documentation

## Monitoring Updates

### Real-time Monitoring

```bash
# Application logs
docker-compose logs -f app

# PM2 monitoring
pm2 monit

# System resources
docker stats
```

### Health Checks

```bash
# Basic health
curl http://localhost:6001/api/health

# Detailed status
curl http://localhost:6001/api/status
```

## Automated Updates

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/class-notes-pwa
            ./scripts/update.sh
```

### Scheduled Updates

```bash
# Add to crontab for weekly updates
0 3 * * 0 /path/to/class-notes-pwa/scripts/update.sh
```

## Troubleshooting Updates

### Update Failed

```bash
# Check logs
docker-compose logs --tail=100 app

# Rollback
git checkout HEAD~1
./scripts/deploy.sh
```

### Migration Error

```bash
# Check migration status
npm run migrate:status

# Fix and retry
npm run migrate:fix
npm run migrate:up
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Scale if needed
docker-compose scale app=3
```

## Best Practices

1. **Test First**: Always test updates in development
2. **Gradual Rollout**: Use canary deployments for major changes
3. **Monitor Closely**: Watch logs during and after updates
4. **Document Changes**: Update changelog and documentation
5. **Communicate**: Notify users of significant changes

## Emergency Procedures

### Complete Rollback

```bash
# Stop everything
docker-compose down

# Restore backup
./scripts/restore-backup.sh latest

# Start previous version
git checkout v1.2.2
./scripts/deploy.sh
```

### Emergency Maintenance Mode

```bash
# Enable maintenance mode
./scripts/maintenance.sh on

# Perform fixes
# ...

# Disable maintenance mode
./scripts/maintenance.sh off
```

Remember: Always backup before updating and have a rollback plan ready!