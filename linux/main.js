// Screen Destroyer — Linux (Electron) shell.
// Opens a frameless, transparent, always-on-top window over every monitor and
// loads the same engine the Android app uses (../core).
//
//   screen-destroyer               transparent overlay (needs a compositor; default)
//   screen-destroyer --screenshot  grab the desktop first and draw on that image
//                                  (use this on X11 without a compositor)
const { app, BrowserWindow, screen, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

const SCREENSHOT_MODE = process.argv.includes('--screenshot');

// Linux needs these for real per-pixel transparency.
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const engineHtml = app.isPackaged
  ? path.join(process.resourcesPath, 'core', 'index.html')
  : path.join(__dirname, '..', 'core', 'index.html');

async function grabScreens() {
  const displays = screen.getAllDisplays();
  const maxW = Math.max(...displays.map((d) => d.size.width * d.scaleFactor));
  const maxH = Math.max(...displays.map((d) => d.size.height * d.scaleFactor));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
  const byId = new Map();
  for (const s of sources) byId.set(String(s.display_id), s.thumbnail.toDataURL());
  // fall back to source order if display ids are not reported (some Wayland setups)
  return displays.map((d, i) => byId.get(String(d.id)) || (sources[i] && sources[i].thumbnail.toDataURL()) || null);
}

async function createWindows() {
  const displays = screen.getAllDisplays();
  let shots = [];
  if (SCREENSHOT_MODE) {
    try { shots = await grabScreens(); } catch (e) { console.error('screenshot failed, using transparency:', e); }
  }

  displays.forEach((d, i) => {
    const { x, y, width, height } = d.bounds;
    const win = new BrowserWindow({
      x, y, width, height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      fullscreenable: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true);
    win.loadFile(engineHtml);
    win.once('ready-to-show', () => {
      const shot = shots[i];
      if (shot) win.webContents.executeJavaScript(`setBackground(${JSON.stringify(shot)})`).catch(() => {});
      win.show();
      win.focus();
    });
  });
}

ipcMain.on('destroyer:close', () => app.quit());
app.on('window-all-closed', () => app.quit());

// A short delay is the well-known workaround for transparent windows on Linux.
app.whenReady().then(() => setTimeout(createWindows, process.platform === 'linux' ? 300 : 0));
