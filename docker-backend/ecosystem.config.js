// PM2 Ecosystem Configuration for Recoder Docker Backend
// Usage: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'recoder-docker-backend',
      script: 'dist/server.js',
      instances: 1, // Single instance for Docker socket access
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',
        PORT: 3100,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3100,
      },
      // Load .env.production in production
      node_args: '--env-file=.env.production',
      // Error logging
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_file: 'logs/combined.log',
      time: true,
      // Graceful restart
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
