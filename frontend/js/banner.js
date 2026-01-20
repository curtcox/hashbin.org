import { bannerConfig } from './banner-config.js';

export function renderBanner() {
  if (!bannerConfig.visible) return;
  let banner = document.getElementById('site-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'site-banner';
    document.body.prepend(banner);
  }
  banner.textContent = bannerConfig.text;
  banner.style.position = 'fixed';
  banner.style.top = '0';
  banner.style.left = '0';
  banner.style.width = '100vw';
  banner.style.zIndex = '10000';
  banner.style.background = bannerConfig.background;
  banner.style.color = bannerConfig.color;
  banner.style.textAlign = 'center';
  banner.style.fontWeight = 'bold';
  banner.style.fontSize = '1.15rem';
  banner.style.padding = '0.75em 0';
  banner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
}
