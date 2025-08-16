/**
 * Simple Electron Main Process for Recoder.xyz Desktop
 * Simplified version without complex telemetry to avoid EPIPE errors
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false,
        icon: path.join(__dirname, '../assets/icon.png')
    });

    // Load the app
    const startUrl = isDev 
        ? 'http://localhost:3000' 
        : `file://${path.join(__dirname, '../build/index.html')}`;
    
    mainWindow.loadURL(startUrl);

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log('🚀 Recoder.xyz Desktop - Ready!');
        
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Create application menu
    createMenu();
}

function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Project',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.send('menu-new-project');
                    }
                },
                {
                    label: 'Open Project',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory'],
                            title: 'Select Project Directory'
                        });
                        
                        if (!result.canceled) {
                            mainWindow.webContents.send('menu-open-project', result.filePaths[0]);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectall' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'AI',
            submenu: [
                {
                    label: 'Generate Code',
                    accelerator: 'CmdOrCtrl+G',
                    click: () => {
                        mainWindow.webContents.send('menu-generate-code');
                    }
                },
                {
                    label: 'Chat with AI',
                    accelerator: 'CmdOrCtrl+Shift+C',
                    click: () => {
                        mainWindow.webContents.send('menu-ai-chat');
                    }
                },
                { type: 'separator' },
                {
                    label: 'AI Settings',
                    click: () => {
                        mainWindow.webContents.send('menu-ai-settings');
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Recoder.xyz',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Recoder.xyz',
                            message: 'Recoder.xyz Desktop',
                            detail: 'AI-powered development platform\nVersion: 1.0.0\nBuilt with Electron'
                        });
                    }
                },
                {
                    label: 'Documentation',
                    click: () => {
                        shell.openExternal('https://docs.recoder.xyz');
                    }
                },
                {
                    label: 'GitHub',
                    click: () => {
                        shell.openExternal('https://github.com/recoder-xyz/recoder');
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideothers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
});

ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});

// Simple logging without telemetry
ipcMain.on('log', (event, level, message) => {
    console.log(`[${level.toUpperCase()}] ${message}`);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit in production to prevent crashes
    if (isDev) {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit in production to prevent crashes
});

console.log('🚀 RECODER.XYZ DESKTOP - STARTING...');
console.log('📊 Version: 1.0.0');
console.log('🔧 Environment:', isDev ? 'DEVELOPMENT' : 'PRODUCTION');
console.log('⚡ Electron Ready!');