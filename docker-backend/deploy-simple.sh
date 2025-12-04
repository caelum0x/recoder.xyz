#!/bin/bash
set -e

echo "🚀 Deploying Recoder Backend (No Docker) to Oracle Cloud"

# Configuration
SERVER_IP="130.162.228.194"
SSH_KEY="/Users/arhansubasi/Downloads/ssh-key-2025-12-04.key"
SERVER_USER="opc"
REMOTE_DIR="/home/opc/recoder-backend"

echo "📦 Step 1: Preparing server (rebooting to clear stuck processes)..."
ssh -i "$SSH_KEY" -o ConnectTimeout=10 $SERVER_USER@$SERVER_IP "sudo reboot" 2>/dev/null || true

echo "⏳ Waiting 90 seconds for reboot..."
sleep 90

echo "🔗 Step 2: Testing connection..."
for i in {1..5}; do
    if ssh -i "$SSH_KEY" -o ConnectTimeout=10 $SERVER_USER@$SERVER_IP "echo 'Connected'"; then
        echo "✅ Server is ready"
        break
    fi
    echo "Attempt $i/5 failed, retrying in 15s..."
    sleep 15
done

echo "📦 Step 3: Installing Node.js..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP << 'ENDSSH'
# Install Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Verify
node --version
npm --version
ENDSSH

echo "📂 Step 4: Creating directory..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_DIR"

echo "📤 Step 5: Uploading simplified backend..."
cat > /tmp/simple-server.js << 'ENDJS'
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'direct', runtime: 'nodejs' });
});

// Create project
app.post('/api/project', async (req, res) => {
  try {
    const { projectId, files } = req.body;
    const projectDir = `/tmp/projects/${projectId}`;

    await fs.mkdir(projectDir, { recursive: true });

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(projectDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    res.json({ success: true, projectId, path: projectDir });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute command
app.post('/api/exec', async (req, res) => {
  try {
    const { projectId, command } = req.body;
    const projectDir = `/tmp/projects/${projectId}`;

    const proc = spawn('bash', ['-c', command], {
      cwd: projectDir,
      env: { ...process.env, PATH: process.env.PATH }
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      res.json({ success: code === 0, output, exitCode: code });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Recoder Backend running on port ${PORT} (Direct mode - No Docker)`);
});
ENDJS

echo "📤 Uploading server..."
scp -i "$SSH_KEY" /tmp/simple-server.js $SERVER_USER@$SERVER_IP:$REMOTE_DIR/server.js

echo "📦 Step 6: Creating package.json..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP << 'ENDSSH'
cd /home/opc/recoder-backend
cat > package.json << 'EOF'
{
  "name": "recoder-backend-simple",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
EOF
ENDSSH

echo "📦 Step 7: Installing dependencies..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP "cd $REMOTE_DIR && npm install"

echo "🔧 Step 8: Creating systemd service..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP << 'ENDSSH'
sudo tee /etc/systemd/system/recoder-backend.service > /dev/null << 'EOF'
[Unit]
Description=Recoder Backend (Direct Mode)
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/home/opc/recoder-backend
Environment="NODE_ENV=production"
Environment="PORT=3100"
ExecStart=/usr/bin/node /home/opc/recoder-backend/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable recoder-backend
sudo systemctl start recoder-backend
sleep 3
sudo systemctl status recoder-backend --no-pager
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo "🌐 Backend running at: http://$SERVER_IP:3100"
echo ""
echo "📊 Check status:"
echo "  ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'sudo systemctl status recoder-backend'"
echo ""
echo "📝 View logs:"
echo "  ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'sudo journalctl -u recoder-backend -f'"
echo ""
echo "🧪 Test:"
echo "  curl http://$SERVER_IP:3100/health"
