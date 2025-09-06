// src/utils/analytics.js
export const GA_ID = import.meta.env.VITE_GA_ID;
export const IS_PROD = import.meta.env.PROD;

function canSend() {
  return IS_PROD && GA_ID && typeof window !== 'undefined' && typeof window.gtag === 'function';
}

export function trackPageView(path, title) {
  if (!canSend()) return;
  window.gtag('event', 'page_view', {
    page_title: title,
    page_location: window.location.href,
    page_path: path,
  });
}

export function trackEvent(name, params = {}) {
  if (!canSend()) return;
  window.gtag('event', name, params);
}
