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
    function hookPrint(win) {
      if (!win) return;
      try {
        win.print = function() {
          if (window.top && window.top.trithaBrowser) {
            window.top.trithaBrowser.print();
          }
        };
      } catch (e) {}
    }

    hookPrint(window);

    // Hook existing iframes
    document.querySelectorAll('iframe').forEach(ifr => {
      hookPrint(ifr.contentWindow);
      ifr.addEventListener('load', () => hookPrint(ifr.contentWindow));
    });

    // Watch for dynamically added iframes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.tagName === 'IFRAME') {
            hookPrint(node.contentWindow);
            node.addEventListener('load', () => hookPrint(node.contentWindow));
          } else if (node.querySelectorAll) {
            node.querySelectorAll('iframe').forEach(ifr => {
              hookPrint(ifr.contentWindow);
              ifr.addEventListener('load', () => hookPrint(ifr.contentWindow));
            });
          }
        });
      });
    });
    
    if (document.body || document.documentElement) {
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
      });
    }
  `;
  target.appendChild(script);
  script.remove();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', installPrintOverride, { once: true });
} else {
  installPrintOverride();
}
