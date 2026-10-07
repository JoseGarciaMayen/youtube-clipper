const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

// Disable SUID sandbox requirement on Linux desktop environments
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Math Clipper Studio',
    backgroundColor: '#090a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV === 'development';
  // If in dev mode with Vite server, use 5173, otherwise load the fast integrated backend on 8080
  const startUrl = process.env.ELECTRON_START_URL
    ? process.env.ELECTRON_START_URL
    : (isDev ? 'http://localhost:5173' : 'http://127.0.0.1:8080');

  mainWindow.loadURL(startUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
