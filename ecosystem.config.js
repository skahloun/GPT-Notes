module.exports = {
  apps: [{
    name: 'class-notes-pwa',
    script: './dist/app.js',
    instances: process.env.PM2_INSTANCES || 2,
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 6001
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    
    // Advanced PM2 configuration
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Monitoring
    monitoring: true,
    
    // Auto restart on file changes (disable in production)
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      'transcripts',
      'data',
      '.git'
    ],
    
    // CPU and memory monitoring
    max_cpu_percent: 80,
    
    // Cluster mode specific
    instance_var: 'INSTANCE_ID',
    
    // Error handling
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    
    // Process metadata
    node_args: '--max-old-space-size=2048',
    
    // Environment specific configurations
    env_production: {
      NODE_ENV: 'production',
      PORT: 6001
    },
    
    env_development: {
      NODE_ENV: 'development',
      PORT: 6001,
      watch: true
    }
  }],
  
  // Deploy configuration
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/class-notes-pwa.git',
      path: '/var/www/class-notes-pwa',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};