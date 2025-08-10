# Single stage build with all dependencies
FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app

# Copy all files
COPY . .

# Install all dependencies and build
RUN npm install --legacy-peer-deps && \
    npm run build && \
    npm prune --production --legacy-peer-deps && \
    npm cache clean --force

# Create directories
RUN mkdir -p /app/data /app/transcripts

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 6001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6001/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start the application
CMD ["node", "dist/app.js"]