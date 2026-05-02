# Tritha Browser Prompt

Build a stable Electron desktop browser wrapper for `https://panel.tritha.cloud` with a strong focus on reliable startup, kiosk/fullscreen behavior, and clean packaging for macOS.

## Goal

Create a single-site browser app called **Tritha** that opens `https://panel.tritha.cloud/login` and behaves like a polished dedicated browser, not a generic Electron demo.

## Required Behavior

- The app must launch directly into the Tritha panel experience.
- The correct web route is:
  - `https://panel.tritha.cloud/login`
- Do not force the site into hash-router mode like `#/login`.
- Do not expose a fake `window.electron` object if that changes the site’s routing behavior.
- The app should support a lightweight custom bridge only for:
  - opening settings
  - printing
  - retrying load
  - closing the app

## Startup Requirements

- On startup, show a local branded loading screen immediately.
- After the loading screen appears, load the remote Tritha URL.
- If the loading screen fails for any reason, fall back directly to the remote URL instead of leaving a blank screen.
- The user must never see a plain black or white empty window during normal startup.

## Kiosk / Fullscreen Requirements

- The browser should support fullscreen or kiosk-style usage.
- Fullscreen transitions must be event-driven, not based on arbitrary `setTimeout` delays.
- Avoid race conditions during startup that cause:
  - black screen
  - white screen
  - frozen first paint
- When opening a settings window, exit fullscreen safely first.
- When closing settings, restore fullscreen only after the main renderer is ready again.
- Show Errors as alerts if any

## Remote Site Compatibility

- The site is a remote SPA hosted at `panel.tritha.cloud`.
- Do not inject brittle behavior that can break the remote app unnecessarily.
- Only inject the minimum UI needed for app controls.
- Keep DOM/CSS injection isolated and defensive.
- Avoid changing site behavior in ways that alter routing unless explicitly required.

## Service Worker / Cache Handling

- Prevent stale service worker or PWA cache behavior from breaking the Electron app.
- Clear service worker and cache storage before loading the remote app if needed.
- The Electron wrapper must prefer a fresh, reliable load over stale cached assets.

## Printing

- Override `window.print()` safely through preload or bridge logic.
- Printing should use Electron silent print when configured.
- If no printer is configured, open the settings window first.

## Settings Window

- Provide a native Electron settings window.
- Settings should allow:
  - changing the panel URL
  - choosing a printer
  - closing the app
- The settings window should be stable in fullscreen mode and not disappear behind the main window.

## Error Handling

- If the remote app fails to load, show a branded local error screen.
- Provide a retry action.
- Log useful diagnostics for:
  - load failures
  - renderer crashes
  - console errors
  - final resolved URL

## Packaging Requirements

- Build for macOS,Linux,Windows
- Ensure all local HTML assets are included in the packaged app:
  - loading page
  - error page
  - settings page
- Use a valid app icon of at least `512x512`.
- Produce a runnable `.app` bundle.

## Implementation Notes

- Use `contextIsolation: true`.
- Keep `nodeIntegration: false`.
- Use preload only for safe, narrow APIs.
- Prefer simple, maintainable code over clever hacks.
- The finished app should feel like a production kiosk/browser wrapper for Tritha.

## Success Criteria

The app is successful if:

- it always shows visible content during startup
- it opens the correct route: `https://panel.tritha.cloud/login`
- it does not get stuck on `#/login`
- it avoids blank black/white startup screens
- fullscreen behavior is stable
- settings open reliably
- the packaged macOS app behaves the same as the local development run
