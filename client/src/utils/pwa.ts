/**
 * SHIORI PWA Detection & Installation Utility
 */

let globalDeferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    globalDeferredPrompt = e;
    window.dispatchEvent(new CustomEvent('shiori:beforeinstallprompt'));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    window.dispatchEvent(new CustomEvent('shiori:appinstalled'));
  });
}

/**
 * Detects if the current environment is running as an installed PWA (standalone mode)
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Standard CSS display-mode media queries
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isDisplayFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const isDisplayMinimalUi = window.matchMedia('(display-mode: minimal-ui)').matches;

  // 2. iOS Safari standalone property
  const isIosStandalone = (window.navigator as any).standalone === true;

  // 3. Android TWA / app referrer
  const isAndroidApp = typeof document !== 'undefined' && document.referrer.includes('android-app://');

  // 4. Manual override for developer testing (?standalone=true)
  const urlParams = new URLSearchParams(window.location.search);
  const isDevStandalone = urlParams.get('standalone') === 'true';

  return isDisplayStandalone || isDisplayFullscreen || isDisplayMinimalUi || isIosStandalone || isAndroidApp || isDevStandalone;
}

/**
 * Detects if device is running iOS
 */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Returns stored deferred beforeinstallprompt event
 */
export function getDeferredInstallPrompt(): any {
  return globalDeferredPrompt;
}

/**
 * Clears stored deferred prompt
 */
export function clearDeferredInstallPrompt(): void {
  globalDeferredPrompt = null;
}
