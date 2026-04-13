module.exports = {
  apps: [
    // ── recoder-app (Next.js) ───────────────────────────────────────
    {
      name: 'recoder-app',
      cwd: '/root/recoder.xyz/app',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: '/bin/bash',
      max_memory_restart: '800M',
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
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_APP_URL: 'https://recoder.xyz',
        BETTER_AUTH_URL: 'https://recoder.xyz',
        MAIN_SITE_URL: 'https://recoder.xyz',
        NEXT_PUBLIC_RECODER_WEB_URL: 'https://web.recoder.xyz'
      }
    },

    // ── recoder-agents (Next.js) ──────────────────────────────────
    {
      name: 'recoder-agents',
      cwd: '/root/recoder.xyz/recoder-agents',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: 'none',
      max_memory_restart: '1500M',
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
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_BACKEND_URL: 'https://api.recoder.xyz/v1',
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:8000'
      }
    },

    // ── recoder-backend (Python / FastAPI + uvicorn) ────────────────
    {
      name: 'recoder-backend',
      cwd: '/root/recoder.xyz/backend',
      script: '.venv/bin/gunicorn',
      args: 'api:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 300 --max-requests 500 --max-requests-jitter 50 --graceful-timeout 30',
      interpreter: 'none',
      max_memory_restart: '1000M',
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      max_restarts: 15,
      min_uptime: '10s',
      time: true,
      error_file: '/root/recoder.xyz/logs/recoder-backend/error.log',
      out_file: '/root/recoder.xyz/logs/recoder-backend/out.log',
      env: {
        PORT: 8000,
        COMPOSIO_API_KEY: 'ak_7x7ZAWny-bw2qgN7ll8K',
        // SearXNG self-hosted search — backend runs on host, SearXNG bound to 127.0.0.1:8888
        SEARXNG_URL: 'http://127.0.0.1:8888'
      }
    },

    // ── recoder-pm (Turbo monorepo – Next.js PM app) ────────────────
    {
      name: 'recoder-pm',
      cwd: '/root/recoder.xyz/recoder-pm/apps/app',
      script: './start-pm2.sh',
      interpreter: '/bin/bash',
      max_memory_restart: '1500M',
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
        HOSTNAME: '0.0.0.0',
        REDIS_URL: 'redis://127.0.0.1:6379',
        // SearXNG self-hosted search — PM2 processes run on host, SearXNG bound to 127.0.0.1:8888
        SEARXNG_URL: 'http://127.0.0.1:8888'
      }
    },

    // ── recoder-agency (Turbo monorepo – Next.js agency app, standalone) ──
    {
      name: 'recoder-agency',
      cwd: '/root/recoder.xyz/recoder-agency/apps/agency',
      script: './start-pm2.sh',
      interpreter: '/bin/bash',
      max_memory_restart: '1500M',
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
        HOSTNAME: '0.0.0.0',
        ALLOW_LOCALHOST_DB: 'true',
        GISELLE_STORAGE_ROOT: '/root/recoder.xyz/data/giselle-storage',
        SEARXNG_URL: 'http://127.0.0.1:8888',
        // Auth callback URLs — must point to agency.recoder.xyz, not recoder.xyz,
        // to prevent the main app's intl middleware from injecting locale prefixes
        // (e.g. /tr/) into the OAuth callback path and causing 404s.
        NEXT_PUBLIC_APP_URL: 'https://agency.recoder.xyz',
        BETTER_AUTH_URL: 'https://recoder.xyz'
      }
    }
  ]
};
