(() => {
  'use strict';

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;

  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024);

  document.documentElement.classList.toggle('is-mobile', isMobile);
  document.documentElement.classList.toggle('is-standalone', isStandalone);

  // ── Service worker ─────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // ── Prevent pull-to-refresh / overscroll on mobile ─────
  document.body.addEventListener('touchmove', (e) => {
    if (e.target.closest('.overlay, .zen-overlay, .card, .zen-card')) return;
    e.preventDefault();
  }, { passive: false });

  // ── Install prompt ─────────────────────────────────────
  let deferredPrompt = null;
  const installBanner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-btn');
  const dismissInstall = document.getElementById('dismiss-install');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBanner && !localStorage.getItem('install-dismissed')) {
      installBanner.classList.remove('hidden');
    }
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBanner?.classList.add('hidden');
  });

  dismissInstall?.addEventListener('click', () => {
    localStorage.setItem('install-dismissed', '1');
    installBanner?.classList.add('hidden');
  });

  // iOS: show manual install hint (no beforeinstallprompt)
  const iosHint = document.getElementById('ios-install-hint');
  if (iosHint && isMobile && !isStandalone && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    iosHint.classList.remove('hidden');
  }

  // ── Wake lock (keep screen on while playing) ───────────
  let wakeLock = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* unsupported or denied */ }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.__babyBootRunning) {
      requestWakeLock();
    }
  });

  window.__babyBootMobile = {
    isMobile,
    isStandalone,
    requestWakeLock,
    releaseWakeLock,
    vibrate(pattern) {
      if (navigator.vibrate) navigator.vibrate(pattern);
    },
  };
})();
