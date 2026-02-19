module.exports = {
  apps: [
    // ── recoder-app (Next.js) ───────────────────────────────────────
    {
      name: 'recoder-app',
      cwd: '/root/recoder.xyz/app',
      script: 'node_modules/.bin/next',
      args: 'start',
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-app/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-app/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── recoder-frontend (Next.js) ──────────────────────────────────
    {
      name: 'recoder-frontend',
      cwd: '/root/recoder.xyz/recoder-frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-frontend/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-frontend/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── recoder-web (Remix + Express server.js) ─────────────────────
    {
      name: 'recoder-web',
      cwd: '/root/recoder.xyz/recoder-web',
      script: 'server.js',
      max_memory_restart: '1536M',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-web/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-web/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 5173,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── docker-backend (Node.js / Express) ──────────────────────────
    {
      name: 'docker-backend',
      cwd: '/root/recoder.xyz/docker-backend',
      script: 'dist/server.js',
      max_memory_restart: '2G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/docker-backend/error.log',
      out_file: '/root/recoder.xyz/logs/docker-backend/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── recoder-backend (Python / FastAPI + uvicorn) ────────────────
    {
      name: 'recoder-backend',
      cwd: '/root/recoder.xyz/backend',
      interpreter: 'python3',
      script: '-m',
      args: 'uvicorn api:app --host 0.0.0.0 --port 8000',
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-backend/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-backend/out.log',
      env: {
        PORT: 8000
      }
    },

    // ── recoder-pm (Turbo monorepo – Next.js web app, standalone) ───
    {
      name: 'recoder-pm',
      cwd: '/root/recoder.xyz/recoder-pm/apps/web',
      script: '.next/standalone/recoder-pm/apps/web/server.js',
      max_memory_restart: '512M',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-pm/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-pm/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── recoder-studio (Next.js) ────────────────────────────────────
    {
      name: 'recoder-studio',
      cwd: '/root/recoder.xyz/recoder-studio',
      script: 'node_modules/.bin/next',
      args: 'start',
      max_memory_restart: '512M',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-studio/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-studio/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── recoder-agency (Turbo monorepo – Next.js agency app, standalone) ──
    {
      name: 'recoder-agency',
      cwd: '/root/recoder.xyz/recoder-agency/apps/agency',
      script: '.next/standalone/apps/agency/server.js',
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-agency/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-agency/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3007,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── openclaw (Node.js gateway) ──────────────────────────────────
    {
      name: 'openclaw',
      cwd: '/root/recoder.xyz/openclaw',
      script: 'scripts/run-node.mjs',
      args: 'gateway run --bind 0.0.0.0 --port 18789',
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/openclaw/error.log',
      out_file: '/root/recoder.xyz/logs/openclaw/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 18789
      }
    }
  ]
};
