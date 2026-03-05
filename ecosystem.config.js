module.exports = {
  apps: [
    // ── recoder-app (Next.js) ───────────────────────────────────────
    {
      name: 'recoder-app',
      cwd: '/root/recoder.xyz/app',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: 'none',
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

    // ── recoder-agents (Next.js) ──────────────────────────────────
    {
      name: 'recoder-agents',
      cwd: '/root/recoder.xyz/recoder-agents',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: 'none',
      max_memory_restart: '1G',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-agents/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-agents/out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOSTNAME: '0.0.0.0'
      }
    },

    // ── recoder-backend (Python / FastAPI + uvicorn) ────────────────
    {
      name: 'recoder-backend',
      cwd: '/root/recoder.xyz/backend',
      script: '.venv/bin/gunicorn',
      args: 'api:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 75',
      interpreter: 'none',
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

    // ── recoder-pm (Turbo monorepo – Next.js web app) ────────────────
    {
      name: 'recoder-pm',
      cwd: '/root/recoder.xyz/recoder-pm/apps/web',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: 'none',
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
      interpreter: 'none',
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
      script: './start.sh',
      interpreter: 'none',
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
    }
  ]
};
