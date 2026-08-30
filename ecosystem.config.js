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
        MAIN_SITE_URL: 'https://recoder.xyz'
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
        // Secret sourced from the host env — NEVER hardcode. The prior inline value
        // (exposed in git history) MUST be rotated in Composio.
        COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
        // SearXNG self-hosted search — backend runs on host, SearXNG bound to 127.0.0.1:8888
        SEARXNG_URL: 'http://127.0.0.1:8888'
      }
    }
  ]
};
