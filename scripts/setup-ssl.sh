#!/bin/bash

# SSL Certificate setup script using Let's Encrypt
# Usage: ./scripts/setup-ssl.sh yourdomain.com your-email@example.com

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check arguments
if [ "$#" -ne 2 ]; then
    echo -e "${RED}Usage: $0 <domain> <email>${NC}"
    echo "Example: $0 classnotes.example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2

echo -e "${GREEN}🔒 Setting up SSL certificate for $DOMAIN${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Stop nginx if running
echo -e "${YELLOW}Stopping nginx...${NC}"
docker-compose stop nginx 2>/dev/null || true

# Get certificate
echo -e "${YELLOW}Obtaining SSL certificate...${NC}"
certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    -d $DOMAIN \
    -d www.$DOMAIN

# Create SSL directory
mkdir -p ./ssl

# Copy certificates
echo -e "${YELLOW}Copying certificates...${NC}"
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ./ssl/cert.pem
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ./ssl/key.pem

# Set permissions
chmod 644 ./ssl/cert.pem
chmod 600 ./ssl/key.pem

# Update nginx configuration for SSL
echo -e "${YELLOW}Updating nginx configuration...${NC}"
cat > nginx-ssl.conf << EOF
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name $DOMAIN www.$DOMAIN;
        return 301 https://\$server_name\$request_uri;
    }
    
    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name $DOMAIN www.$DOMAIN;
        
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        
        include /etc/nginx/nginx-app.conf;
    }
}
EOF

# Setup auto-renewal
echo -e "${YELLOW}Setting up auto-renewal...${NC}"
cat > /etc/cron.d/certbot-renew << EOF
0 0,12 * * * root certbot renew --quiet --post-hook "cd $(pwd) && ./scripts/reload-ssl.sh"
EOF

# Create reload script
cat > ./scripts/reload-ssl.sh << 'EOF'
#!/bin/bash
cp /etc/letsencrypt/live/*/fullchain.pem ./ssl/cert.pem
cp /etc/letsencrypt/live/*/privkey.pem ./ssl/key.pem
docker-compose restart nginx
EOF

chmod +x ./scripts/reload-ssl.sh

# Start nginx with SSL
echo -e "${YELLOW}Starting nginx with SSL...${NC}"
docker-compose up -d nginx

echo -e "${GREEN}✅ SSL setup complete!${NC}"
echo -e "${GREEN}Your site is now accessible at: https://$DOMAIN${NC}"
echo -e "${YELLOW}Note: Certificates will auto-renew every 12 hours via cron${NC}"