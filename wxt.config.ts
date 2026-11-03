import { defineConfig } from 'wxt';

const ICON_PATHS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PageInk',
    description: 'Lightweight floating ink layer for drawing directly over webpages.',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting'],
    icons: ICON_PATHS,
    action: {
      default_title: 'Toggle PageInk',
      default_icon: ICON_PATHS,
    },
  },
});
