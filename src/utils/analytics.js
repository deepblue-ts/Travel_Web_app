// src\utils\analytics.js
export const GA_ID = import.meta.env.VITE_GA_ID;

function hasGA() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function' && !!GA_ID;
}

export function trackPageView(path, title) {
  if (!hasGA()) return;
  window.gtag('event', 'page_view', {
    page_title: title || document.title,
    page_location: window.location.href,
    page_path: path, // 例: '/wizard'（Hashは含めない）
  });
}

export function trackEvent(name, params = {}) {
  if (!hasGA()) return;
  window.gtag('event', name, params);
}
