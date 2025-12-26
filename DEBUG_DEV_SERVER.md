# Debug Dev Server Not Starting

## The Issue

The dev server process is starting but **dying immediately**. Only the PTY server is running.

```
Process check:
root  1  node /opt/pty/pty-server.js  ← Only this, no vite/npm/node!
```

## Manual Debugging Steps

### Step 1: Restart docker-backend with new debugging

```bash
# Terminal: docker-backend
cd docker-backend
npm run dev
```

### Step 2: Restart recoder-web

```bash
# Terminal: recoder-web
cd recoder-web
npm run dev
```

### Step 3: Generate a project and watch docker-backend logs

You should now see:
```
📝 Dev server process started with PID: 123
🔍 Process status after 2s: PID CMD
                             123 npm run dev
✅ Dev server responding on port 10001
```

OR if it fails:
```
📝 Dev server process started with PID: 123
🔍 Process status after 2s: Process 123 not found
❌ Dev server process died immediately!
💥 Error logs: <actual error here>
```

### Step 4: Manually inspect the container

If you want to dig deeper:

```bash
# List all containers
docker ps

# Find the recoder container ID (IMAGE: recoder-universal:latest)
# Then SSH into it:
docker exec -it <container-id> bash

# Inside container:
cd /workspace
ls -la                    # Check files exist
cat package.json          # Verify dev script exists
cat /tmp/dev.log          # Check logs
npm run dev               # Try running manually to see error
```

## Common Causes & Fixes

### Cause 1: package.json missing "dev" script

**Check:**
```bash
docker exec -it <container-id> cat /workspace/package.json
```

**Should have:**
```json
{
  "scripts": {
    "dev": "vite"  ← Must exist!
  }
}
```

**Fix:** AI should generate proper package.json with dev script

### Cause 2: node_modules missing

**Check:**
```bash
docker exec -it <container-id> ls -la /workspace/node_modules
```

**Should have:** Lots of folders (vite, react, etc.)

**Fix:** Ensure npm install completed successfully

### Cause 3: Wrong working directory

**Check:**
```bash
docker exec -it <container-id> pwd
# Should be: /workspace
```

**Fix:** Ensure cwd is set to /workspace in exec command

### Cause 4: npm not found / PATH issue

**Check:**
```bash
docker exec -it <container-id> which npm
# Should be: /usr/bin/npm or /usr/local/bin/npm
```

**Fix:** Rebuild Docker image if npm is missing

## Expected Working Flow

1. **Container created** ✅
   - Files written to /workspace
   - package.json exists
   - npm install runs successfully
   - node_modules created

2. **Dev server starts** (BROKEN HERE)
   - `npm run dev` executed in background
   - Process should show up in `ps aux`
   - Should write to /tmp/dev.log
   - Should listen on port (5173 for Vite)

3. **Health check passes**
   - HTTP request to port succeeds
   - Preview URL becomes available

4. **Preview loads**
   - Iframe connects to preview proxy
   - Proxy forwards to dev server port
   - User sees the app

## Next Steps

1. **Rebuild both services** (docker-backend + recoder-web)
2. **Generate a new project**
3. **Watch docker-backend terminal** for the new debugging output
4. **Share the logs** showing why process died
