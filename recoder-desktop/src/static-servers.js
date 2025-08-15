const express = require('express');
const path = require('path');

// Serve built apps statically for desktop
const apps = {
  extension: { port: 3100, path: './app-bundles/extension' },
  chat: { port: 3101, path: './app-bundles/chat' },
  web: { port: 3102, path: './app-bundles/web' }
};

function startServers() {
  Object.entries(apps).forEach(([name, config]) => {
    if (require('fs').existsSync(config.path)) {
      const app = express();
      app.use(express.static(config.path));
      
      app.listen(config.port, () => {
        console.log(`📡 ${name} server running on http://localhost:${config.port}`);
      });
    }
  });
}

if (require.main === module) {
  startServers();
}

module.exports = { startServers, apps };