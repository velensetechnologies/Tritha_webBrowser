const { contextBridge, ipcRenderer } = require('electron');

const browserApi = {
  print:        () => ipcRenderer.invoke('print-page'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeApp:     () => ipcRenderer.invoke('close-app'),
  retry:        () => ipcRenderer.invoke('retry-load'),
};

// Keep the legacy bridge used by our own injected controls.
contextBridge.exposeInMainWorld('trithaBrowser', browserApi);

function installPrintOverride() {
  const target = document.head || document.documentElement;
  if (!target) return;

  const script = document.createElement('script');
  // NOTE: We do NOT block service worker registration.
  // The site's SW caches fonts and other assets. Blocking it causes font
  // URLs to return HTML error pages, producing OTS parsing failures in Chromium.
  // Service workers work correctly in Electron 29+ and are safe for a kiosk app
  // targeting a single trusted domain.
  script.textContent = `
    window.print = function() {
      if (window.trithaBrowser) window.trithaBrowser.print();
    };
  `;
  target.appendChild(script);
  script.remove();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', installPrintOverride, { once: true });
} else {
  installPrintOverride();
}
