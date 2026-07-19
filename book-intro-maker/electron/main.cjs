const {app, BrowserWindow, Menu, shell, dialog} = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const {pathToFileURL} = require('url');

const APP_NAME = '水星视频模板';
const PORT = Number(process.env.MERCURY_VIDEO_PORT || process.env.PORT || 43110);

const request = (url) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', reject);
    req.setTimeout(1200, () => {
      req.destroy(new Error('timeout'));
    });
  });

const waitForServer = async () => {
  const healthUrl = `http://127.0.0.1:${PORT}/api/health`;
  for (let i = 0; i < 40; i++) {
    try {
      if ((await request(healthUrl)) === 200) return;
    } catch {
      // The local server may still be booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('本地服务启动超时');
};

const firstExistingPath = (candidates) => candidates.find((candidate) => candidate && fs.existsSync(candidate));

const findBrowserExecutable = () =>
  firstExistingPath([
    process.env.BROWSER_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]);

const startLocalServer = async () => {
  const appRoot = app.getAppPath();
  process.chdir(appRoot);
  process.env.PORT = String(PORT);
  process.env.BROWSER_EXECUTABLE = findBrowserExecutable() || process.env.BROWSER_EXECUTABLE || '';
  await import(pathToFileURL(path.join(appRoot, 'scripts', 'server.mjs')).href);
  await waitForServer();
};

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: APP_NAME,
    backgroundColor: '#f3f6fb',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({url}) => {
    shell.openExternal(url).catch(() => undefined);
    return {action: 'deny'};
  });
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
};

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    app.setName(APP_NAME);
    await startLocalServer();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox(APP_NAME, `启动失败：${error instanceof Error ? error.message : String(error)}`);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => console.error(error));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
