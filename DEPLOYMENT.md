# 🚀 Deployment Guide for Class Notes PWA

This guide will help you deploy the Class Notes PWA to various hosting platforms.

## Prerequisites

- Docker and Docker Compose installed
- Domain name (for production)
- SSL certificate (Let's Encrypt recommended)
- AWS account with Transcribe API access
- OpenAI API key
- Google OAuth credentials

## Quick Start with Docker

### 1. Clone and Configure

```bash
git clone https://github.com/your-repo/class-notes-pwa.git
cd class-notes-pwa

# Copy environment template
cp .env.production.example .env.production

# Edit environment variables
nano .env.production
```

### 2. Build and Deploy

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Deploy to production
./scripts/deploy.sh production
```

### 3. Setup SSL (Production)

```bash
sudo ./scripts/setup-ssl.sh yourdomain.com your-email@example.com
```

## Platform-Specific Deployments

### AWS EC2

1. **Launch EC2 Instance**
   - Ubuntu 22.04 LTS
   - t3.medium or larger
   - Security groups: 80, 443, 22, 6001

2. **Install Dependencies**
   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose git
   sudo usermod -aG docker $USER
   ```

3. **Deploy Application**
   ```bash
   git clone your-repo
   cd class-notes-pwa
   ./scripts/deploy.sh production
   ```

4. **Configure Load Balancer**
   - Create Application Load Balancer
   - Enable WebSocket support
   - Configure SSL certificate

### DigitalOcean App Platform

1. **Create App**
   - Source: GitHub repository
   - Type: Web Service
   - Build Command: `npm run build`
   - Run Command: `node dist/app.js`

2. **Add Database**
   - Create Managed PostgreSQL
   - Update DATABASE_URL in environment

3. **Configure Environment**
   - Add all environment variables
   - Set NODE_ENV=production

### Railway

1. **Create Project**
   ```bash
   railway login
   railway init
   railway add
   ```

2. **Configure Services**
   - Add PostgreSQL database
   - Set environment variables
   - Deploy from GitHub

### Heroku Alternative (Render.com)

1. **Create Web Service**
   - Connect GitHub repository
   - Build Command: `npm install && npm run build`
   - Start Command: `node dist/app.js`

2. **Add PostgreSQL**
   - Create PostgreSQL instance
   - Copy connection string

3. **Configure Environment**
   - Add all required variables
   - Set up custom domain

## Production Configuration

### Environment Variables

```env
# Required
NODE_ENV=production
PORT=6001
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secure-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure-password

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# APIs
OPENAI_API_KEY=your-key
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

# Security
ALLOWED_ORIGINS=https://yourdomain.com
RATE_LIMIT_MAX_REQUESTS=100
```

### Database Migration

For existing SQLite databases:

```bash
# Export from SQLite
sqlite3 class-notes.db .dump > backup.sql

# Import to PostgreSQL
psql $DATABASE_URL < backup.sql
```

### Monitoring Setup

1. **Health Checks**
   - Endpoint: `/api/health`
   - Expected: 200 OK

2. **Logging**
   - Application logs: `docker-compose logs -f app`
   - Nginx logs: `docker-compose logs -f nginx`

3. **Metrics**
   - PM2 monitoring: `pm2 monit`
   - Docker stats: `docker stats`

## Maintenance

### Backup

```bash
# Run backup script
./scripts/backup.sh

# Schedule daily backups
crontab -e
0 2 * * * /path/to/class-notes-pwa/scripts/backup.sh
```

### Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild and deploy
./scripts/deploy.sh production
```

### SSL Certificate Renewal

Certificates auto-renew via cron. Manual renewal:

```bash
certbot renew
docker-compose restart nginx
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check nginx WebSocket configuration
   - Ensure ALB has stickiness enabled
   - Verify CORS settings

2. **Database Connection Error**
   - Check DATABASE_URL format
   - Verify network connectivity
   - Check PostgreSQL logs

3. **Audio Streaming Issues**
   - Verify AWS credentials
   - Check Transcribe service limits
   - Monitor bandwidth usage

### Debug Commands

```bash
# Check application logs
docker-compose logs -f app

# Check database connectivity
docker-compose exec app npm run db:test

# Monitor resource usage
docker stats

# Test WebSocket connection
wscat -c wss://yourdomain.com/ws/audio
```

## Performance Optimization

1. **Enable Caching**
   - Static assets via nginx
   - API responses with Redis

2. **Scale Horizontally**
   - Multiple PM2 instances
   - Load balancer distribution

3. **Optimize Database**
   - Add indexes
   - Connection pooling
   - Query optimization

## Security Checklist

- [ ] SSL/TLS enabled
- [ ] Environment variables secured
- [ ] Rate limiting configured
- [ ] CORS properly set
- [ ] Admin credentials changed
- [ ] Database backups enabled
- [ ] Monitoring active
- [ ] Security headers configured

## Support

For issues or questions:
- Check logs: `docker-compose logs`
- Health status: `curl https://yourdomain.com/api/health`
- Documentation: This guide

Happy deploying! 🎉