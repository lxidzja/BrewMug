import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Домен міняється через SITE_URL у CI; локально — заглушка.
const site = process.env.SITE_URL || 'https://brewmug.example';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap({ filter: (page) => !page.includes('/_kit') })],
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  compressHTML: true,
  vite: {
    build: {
      cssMinify: 'lightningcss',
      // Бюджет: жоден ассет не повинен тихо розростатися
      assetsInlineLimit: 1024,
    },
  },
  devToolbar: { enabled: false },
});
