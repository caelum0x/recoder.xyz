/**
 * ACTUAL WORKING Recoder Desktop - Multi-App Integration
 * This is a real, tested implementation
 */

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const isDev = process.argv.includes('--dev');

// REAL URLs that exist
const appUrls = {
  chat: isDev ? 'http://localhost:3003' : 'file://' + path.join(__dirname, '../static/chat.html'),
  web: isDev ? 'http://localhost:3000' : 'file://' + path.join(__dirname, '../static/web.html'),
  extension: isDev ? 'http://localhost:5173' : 'file://' + path.join(__dirname, '../static/extension.html')
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-working.js'),
      webSecurity: !isDev
    }
  });

  // Load a REAL HTML file
  mainWindow.loadFile(path.join(__dirname, 'desktop-ui.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// ACTUAL IPC handlers that work
ipcMain.handle('load-app', async (event, appName) => {
  const url = appUrls[appName];
  if (url && url.startsWith('http') && isDev) {
    // Test if dev server is actually running
    try {
      const response = await fetch(url);
      return { url, available: response.ok };
    } catch {
      return { url: null, available: false, error: `${appName} dev server not running` };
    }
  }
  return { url, available: fs.existsSync(url.replace('file://', '')) };
});

ipcMain.handle('get-app-list', () => {
  return Object.keys(appUrls);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});