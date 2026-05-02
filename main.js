const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

app.setName('Tritha');

// ── Chromium performance flags ─────────────────────────────────────────────
// Disable unused features to reduce RAM and CPU usage
const PERF_SWITCHES = [
  ['log-level',                         '3'],   // suppress noise
  ['disable-extensions'],                        // no Chrome extensions
  ['disable-plugins'],                           // no legacy plugins
  ['disable-sync'],                              // no browser sync
  ['disable-translate'],                         // no translation UI
  ['disable-background-networking'],             // no background net calls
  ['disable-default-apps'],                      // no bundled apps
  ['disable-client-side-phishing-detection'],    // no phishing scanner
  ['disable-prompt-on-repost'],                  // no repost dialogs
  ['disable-domain-reliability'],                // no Google reliability reports
  ['disable-component-update'],                  // no auto component downloads
  ['disable-background-timer-throttling'],        // timers run at full speed
  ['disable-renderer-backgrounding'],            // renderer stays active always
  ['disable-backgrounding-occluded-windows'],    // no throttle when covered
  ['no-first-run'],                              // skip first-run setup
  ['no-default-browser-check'],                  // skip browser check
  ['enable-gpu-rasterization'],                  // GPU-accelerated rendering
  ['enable-zero-copy'],                          // zero-copy texture uploads
];
for (const [flag, val] of PERF_SWITCHES) {
  if (val) app.commandLine.appendSwitch(flag, val);
  else     app.commandLine.appendSwitch(flag);
}

const CONFIG_FILE  = path.join(app.getPath('userData'), 'tritha-config.json');
const ICON_PATH    = path.join(__dirname, 'assets', 'tritha-icon.png');
const LOADING_FILE = path.join(__dirname, 'loading.html');

let mainWindow    = null;
let settingsWindow = null;
let config = { printer: null, url: null };
let isQuitting = false;
let mainWindowReadyToShow = false;
let mainWindowLoaded = false;
let settingsOpenInProgress = false;

function getAppUrl() { return (config && config.url) || null; }
function getAppHostname() {
  try { return new URL(getAppUrl()).hostname; } catch { return null; }
}
function isLoadingScreen(url) { return url.startsWith('file:') && url.includes('loading.html'); }
function loadRemoteApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = getAppUrl();
  if (!url) {
    console.log('[Tritha] No URL configured — opening settings for first-time setup.');
    openSettingsWindow(false);
    return;
  }
  // Load directly — avoid async cache clearing before load which causes blank-screen flashes.
  // Cache/SW cleanup is done lazily in the background after navigating away.
  mainWindow.loadURL(url);
}

// ── Config ────────────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) config = { printer: null, url: null, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch { config = { printer: null, url: null }; }
}

function saveConfig() {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
  catch (e) { console.error('[Tritha] Config save error:', e); }
}

// ── Inject hover controls into the page ──────────────────────────────────────
function injectControls() {
  const wc = mainWindow.webContents;

  // Fix 4: log injection so we know it's running
  console.log('[Tritha] Injecting controls into page...');

  // Fix 1: Corner has a subtle visible indicator (tiny dot) so user knows where to hover
  wc.insertCSS(`
    #__tc_wrap__ {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      width: 130px !important;
      height: 60px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 8px !important;
      padding: 12px !important;
      pointer-events: auto !important;
      background: transparent !important;
    }

    /* Subtle corner glow — shows where to hover */
    #__tc_wrap__::before {
      content: '' !important;
      position: absolute !important;
      top: 6px !important;
      right: 6px !important;
      width: 8px !important;
      height: 8px !important;
      border-radius: 50% !important;
      background: rgba(255,255,255,0.35) !important;
      transition: opacity 0.3s !important;
      opacity: 1 !important;
      pointer-events: none !important;
    }
    #__tc_wrap__:hover::before {
      opacity: 0 !important;
    }

    #__tc_wrap__ button {
      opacity: 0 !important;
      transition: opacity 0.2s ease, transform 0.15s ease !important;
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      border: none !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      font-size: 15px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5) !important;
      pointer-events: auto !important;
    }

    /* Show buttons when hovering the zone OR the buttons themselves */
    #__tc_wrap__:hover button {
      opacity: 1 !important;
    }
    #__tc_wrap__ button:hover {
      opacity: 1 !important;
      transform: scale(1.15) !important;
    }
    #__tc_wrap__ button:active {
      transform: scale(0.93) !important;
    }

    #__tc_s__ {
      background: rgba(50, 60, 80, 0.92) !important;
      color: #e2e8f0 !important;
      border: 1px solid rgba(255,255,255,0.15) !important;
    }
    #__tc_x__ {
      background: rgba(185, 28, 28, 0.9) !important;
      color: #fff !important;
    }
  `).then(() => {
    console.log('[Tritha] CSS injected OK');
  }).catch(e => console.error('[Tritha] CSS inject error:', e));

  wc.executeJavaScript(`
    (function() {
      if (document.getElementById('__tc_wrap__')) return 'already exists';

      const wrap = document.createElement('div');
      wrap.id = '__tc_wrap__';

      const s = document.createElement('button');
      s.id = '__tc_s__';
      s.title = 'Settings (or press Ctrl+Shift+F8)';
      s.innerHTML = '&#9881;';
      s.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (window.trithaBrowser) {
          window.trithaBrowser.openSettings();
        } else {
          console.error('[Tritha] trithaBrowser not available');
        }
      });

      const x = document.createElement('button');
      x.id = '__tc_x__';
      x.title = 'Close Tritha';
      x.innerHTML = '&#10005;';
      x.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (window.trithaBrowser) window.trithaBrowser.closeApp();
      });

      wrap.appendChild(s);
      wrap.appendChild(x);
      document.documentElement.appendChild(wrap);
      return 'injected OK';
    })();
  `).then(result => {
    console.log('[Tritha] JS inject result:', result);
  }).catch(e => console.error('[Tritha] JS inject error:', e));
}

// ── Main Window ───────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    // kiosk:true enters fullscreen at the OS level BEFORE content is shown.
    // This is the correct way to avoid white/black flash on startup.
    // setSimpleFullScreen() called after render causes macOS to repaint → flash.
    kiosk:  true,
    frame:  false,
    show:   false,
    icon:   ICON_PATH,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload:                 path.join(__dirname, 'preload.js'),
      contextIsolation:        true,
      nodeIntegration:         false,
      webSecurity:             true,
      spellcheck:              false,   // saves CPU/RAM
      enableWebSQL:            false,   // deprecated, disable
      backgroundThrottling:    false,   // consistent frame rate
      v8CacheOptions:          'bypassHeuristics', // always use V8 bytecode cache
    },
  });

  // Override user-agent to look like standard Chrome.
  // Electron's default UA contains "Electron/29.0.0" which some CDNs and servers
  // detect and serve different (or broken) responses for assets like fonts.
  const chromeUA = mainWindow.webContents.getUserAgent()
    .replace(/\s*Electron\/[\d.]+/, '');   // strip "Electron/x.x.x" from UA
  mainWindow.webContents.setUserAgent(chromeUA);

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const source = sourceId || 'unknown';
    console.log(`[Tritha][console:${level}] ${message} (${source}:${line})`);
  });

  mainWindow.webContents.on('did-start-loading', () => {
    console.log('[Tritha] Main window started loading:', getAppUrl());
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('[Tritha] DOM ready for:', mainWindow.webContents.getURL());
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    console.log('[Tritha] Main window stopped loading:', mainWindow.webContents.getURL());
  });

  mainWindow.once('ready-to-show', () => {
    mainWindowReadyToShow = true;
    mainWindow.show();
    // Don't enter fullscreen here — wait until the remote URL has fully loaded.
  });
  mainWindow.loadFile(LOADING_FILE);

  // Transition from loading screen → remote URL only after the window is visible.
  mainWindow.webContents.on('did-finish-load', () => {
    const currentUrl = mainWindow.webContents.getURL();

    // ── Loading screen finished — navigate to the remote app ──────────────────
    if (isLoadingScreen(currentUrl)) {
      const doLoad = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        loadRemoteApp();
      };

      // Guard: the window must be visible before we navigate away from loading.html.
      // Without this, the URL load replaces the hidden window content producing a
      // black screen on first show.
      if (mainWindowReadyToShow) {
        // Small delay so the loading screen renders at least one frame.
        setTimeout(doLoad, 80);
      } else {
        mainWindow.once('ready-to-show', () => setTimeout(doLoad, 80));
      }
      return;
    }

    // ── Remote page finished loading ───────────────────────────────────────────
    mainWindowLoaded = true;
    injectControls();
    // kiosk mode handles fullscreen — no manual fullscreen call needed here.
  });

  setupCrashRecovery();
  setupNavigationLock();

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowReadyToShow = false;
    mainWindowLoaded = false;
  });
}

// ── Crash Recovery ────────────────────────────────────────────────────────────
function setupCrashRecovery() {
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    console.log('[Tritha] Renderer gone:', details.reason);
    if (!isQuitting) setTimeout(() => mainWindow.loadURL(getAppUrl()), 1500);
  });

  mainWindow.on('unresponsive', () => {
    console.log('[Tritha] Unresponsive — recovering...');
    mainWindow.webContents.forcefullyCrashRenderer();
    setTimeout(() => mainWindow.loadURL(getAppUrl()), 1500);
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && url && isLoadingScreen(url)) {
      console.log('[Tritha] Loading screen failed, falling back to remote app');
      void loadRemoteApp();
      return;
    }

    if (isMain && code !== -3) {
      console.log('[Tritha] Load failed:', code, desc);
      mainWindow.loadFile(path.join(__dirname, 'error.html'));
    }
  });
}

// ── Navigation Lock ───────────────────────────────────────────────────────────
function setupNavigationLock() {
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Always allow our own local file:// pages (loading screen, error screen).
    if (url.startsWith('file://')) return;

    const allowed = getAppHostname();
    try {
      if (!allowed || !new URL(url).hostname.endsWith(allowed)) {
        console.log('[Tritha] Blocked navigation to:', url);
        event.preventDefault();
      }
    } catch { event.preventDefault(); }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowed = getAppHostname();
    try {
      if (allowed && new URL(url).hostname.endsWith(allowed)) return { action: 'allow' };
    } catch {}
    return { action: 'deny' };
  });
}

// ── Print ─────────────────────────────────────────────────────────────────────
function executePrint() {
  mainWindow.webContents.print(
    { silent: true, printBackground: true, deviceName: config.printer || '' },
    (ok, reason) => { if (!ok) console.error('[Tritha] Print failed:', reason); }
  );
}

// ── Kiosk / Fullscreen helpers ────────────────────────────────────────────────
// We use kiosk mode instead of setSimpleFullScreen to avoid the white/black
// flash that occurs when fullscreen is applied after content has already rendered.

function exitKiosk() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setKiosk(false);
}

function enterKiosk() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setKiosk(true);
}

function onceWindowEvent(window, eventName) {
  return new Promise((resolve) => {
    if (!window || window.isDestroyed()) {
      resolve();
      return;
    }
    window.once(eventName, resolve);
  });
}

function openSettingsWindow(printAfter = false) {
  if (settingsOpenInProgress) return;
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.moveTop();
    settingsWindow.focus();
    return;
  }

  const createSettingsWindow = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) return;

    settingsWindow = new BrowserWindow({
      width: 520, height: 500,
      resizable: false,
      frame: true,
      title: 'Tritha — Settings',
      icon: ICON_PATH,
      acceptFirstMouse: true,
      show: false,
      backgroundColor: '#0f1117',
      webPreferences: {
        preload:          path.join(__dirname, 'settings-preload.js'),
        contextIsolation: true,
        nodeIntegration:  false,
      },
    });

    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

    settingsWindow.webContents.once('did-finish-load', () => {
      settingsWindow.webContents.send('init', { printAfter, selected: config.printer });
      settingsWindow.show();
      settingsWindow.focus();
      settingsOpenInProgress = false;
    });

    settingsWindow.on('closed', () => {
      settingsWindow = null;
      settingsOpenInProgress = false;
      if (!getAppUrl()) {
        // First-run: user closed settings without saving a URL — reopen immediately.
        console.log('[Tritha] Settings closed without a URL — reopening for first-time setup.');
        setTimeout(() => openSettingsWindow(false), 200);
        return;
      }
      console.log('[Tritha] Settings closed — restoring kiosk.');
      enterKiosk();
    });
  };

  settingsOpenInProgress = true;

  // Exit kiosk so the settings window can appear on top.
  if (mainWindow.isKiosk()) {
    onceWindowEvent(mainWindow, 'leave-full-screen').then(createSettingsWindow);
    exitKiosk();
    return;
  }

  createSettingsWindow();
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('print-page', () => {
  if (!config.printer) openSettingsWindow(true);
  else executePrint();
});

ipcMain.handle('open-settings', () => {
  console.log('[Tritha] open-settings IPC received');
  try { openSettingsWindow(false); }
  catch (e) { console.error('[Tritha] Settings open error:', e); }
});

ipcMain.handle('close-app',  () => { isQuitting = true; app.quit(); });
ipcMain.handle('retry-load', () => mainWindow.loadURL(getAppUrl()));
ipcMain.handle('get-url',    () => getAppUrl());

ipcMain.handle('save-url', (e, newUrl) => {
  try { new URL(newUrl); } catch { return { success: false, error: 'Invalid URL' }; }
  config.url = newUrl;
  saveConfig();
  mainWindow.loadURL(newUrl);
  return { success: true };
});

ipcMain.handle('get-printers', async () => {
  const list = await mainWindow.webContents.getPrintersAsync();
  return { printers: list.map(p => ({ name: p.name, isDefault: p.isDefault })), selected: config.printer };
});

ipcMain.handle('save-printer', (e, printerName, printAfter) => {
  config.printer = printerName;
  saveConfig();
  if (printAfter) setTimeout(executePrint, 500);
  return { success: true };
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(ICON_PATH);
  loadConfig();

  // ── Font response interceptor ──────────────────────────────────────────────
  // panel.tritha.cloud serves its SPA index.html for ALL unknown paths including
  // /fonts/*.woff2 — meaning the font URLs return HTML, not font data.
  // This interceptor detects that and replaces the bad response with an empty
  // data URI so Chromium doesn't throw OTS parsing errors.
  // ⚠️  SERVER FIX NEEDED: Deploy the actual font files to panel.tritha.cloud/fonts/
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isFontRequest = /\.(woff2?|ttf|otf|eot)(\?.*)?$/i.test(details.url);
    const contentType   = (details.responseHeaders['content-type'] || details.responseHeaders['Content-Type'] || [''])[0];
    const isHTML        = contentType.includes('text/html');

    if (isFontRequest && isHTML) {
      console.warn(`[Tritha] ⚠️  Server returned HTML for font URL (font files not deployed on server): ${details.url}`);
      // Redirect to a valid empty WOFF2 so the browser doesn't try to parse HTML as font data.
      callback({
        cancel: true,  // abort the bad response; browser will use fallback font silently
      });
      return;
    }
    callback({ responseHeaders: details.responseHeaders });
  });
  createWindow();

  // Fix 3: Use CommandOrControl so it works on both Mac (Cmd) and Windows (Ctrl)
  // Also register a simpler fallback: CommandOrControl+Shift+S
  const shortcuts = [
    { key: 'CommandOrControl+Shift+F8', label: 'Ctrl/Cmd+Shift+F8' },
    { key: 'CommandOrControl+Shift+F9', label: 'Ctrl/Cmd+Shift+F9' },
  ];

  let registered = false;
  for (const sc of shortcuts) {
    const ok = globalShortcut.register(sc.key, () => {
      console.log('[Tritha] Shortcut pressed:', sc.label);
      try { openSettingsWindow(false); }
      catch (e) { console.error('[Tritha] Shortcut error:', e); }
    });
    if (ok) {
      console.log('[Tritha] Global shortcut registered:', sc.label);
      registered = true;
      break;
    }
  }
  if (!registered) console.warn('[Tritha] WARNING: No global shortcut could be registered');

  // ── Escape key → exit confirmation dialog ─────────────────────────────────
  globalShortcut.register('Escape', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Don't show the dialog if settings window is already open
    if (settingsWindow && !settingsWindow.isDestroyed()) return;

    console.log('[Tritha] Escape pressed — showing exit confirmation...');

    // Exit kiosk first so the dialog can appear on top
    const wasKiosk = mainWindow.isKiosk();
    if (wasKiosk) mainWindow.setKiosk(false);

    // Use sync dialog — avoids async race conditions with kiosk state
    const response = dialog.showMessageBoxSync(mainWindow, {
      type:      'question',
      title:     'Exit Tritha',
      message:   'Are you sure you want to exit?',
      buttons:   ['Yes, Exit', 'Cancel'],
      defaultId: 1,   // Cancel is the default (safer for accidental presses)
      cancelId:  1,
      icon:      ICON_PATH,
    });

    if (response === 0) {
      // User clicked "Yes, Exit" — destroy window and force-exit
      console.log('[Tritha] Exit confirmed — quitting.');
      isQuitting = true;
      mainWindow.destroy();   // close window immediately
      app.exit(0);            // exit unconditionally (no close-event race)
    } else {
      // User clicked "Cancel" — restore kiosk
      console.log('[Tritha] Exit cancelled.');
      if (wasKiosk) mainWindow.setKiosk(true);
    }
  });
  console.log('[Tritha] Escape key registered — will prompt before exit.');

  // ── CRASH TEST SHORTCUTS (remove before production) ──────────────────────────
  // Ctrl+Shift+F5  → Hard-crash the renderer (tests render-process-gone recovery)
  globalShortcut.register('CommandOrControl+Shift+F5', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log('\n[CRASH TEST] ▶ TEST 1: Forcing renderer crash — expect auto-recovery in 1.5s...');
    mainWindow.webContents.forcefullyCrashRenderer();
  });

  // Ctrl+Shift+F6  → Load a dead URL (tests did-fail-load → error.html)
  globalShortcut.register('CommandOrControl+Shift+F6', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log('\n[CRASH TEST] ▶ TEST 2: Loading a broken URL — expect error.html to appear...');
    mainWindow.loadURL('https://this-domain-does-not-exist-tritha-test.invalid/');
  });

  // Ctrl+Shift+F7  → Simulate network-recover (reload configured URL after failure)
  globalShortcut.register('CommandOrControl+Shift+F7', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const url = getAppUrl();
    console.log('\n[CRASH TEST] ▶ TEST 3: Reloading configured URL:', url);
    if (url) mainWindow.loadURL(url);
    else console.log('[CRASH TEST] No URL configured — open settings first.');
  });

  console.log('[Tritha] Crash-test shortcuts registered: Ctrl+Shift+F5/F6/F7');
});

app.on('will-quit',         () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
app.on('before-quit',       () => { isQuitting = true; });
