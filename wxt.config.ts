import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PageInk',
    description: 'Lightweight floating ink layer for drawing directly over webpages.',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting'],
    action: {
      default_title: 'Toggle PageInk',
    },
  },
});

