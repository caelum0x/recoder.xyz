module.exports = {
  apps: [
    {
      name: 'recoder-app',
      cwd: '/home/recoder/recoder.xyz/app',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0'
      }
    },
    {
      name: 'recoder-web',
      cwd: '/home/recoder/recoder.xyz/recoder-web',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3009,
        HOSTNAME: '0.0.0.0'
      }
    },
    {
      name: 'docker-backend',
      cwd: '/home/recoder/recoder.xyz/docker-backend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3010,
        HOSTNAME: '0.0.0.0'
      }
    }
  ]
};
