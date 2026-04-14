import { defineConfig } from 'vite';

const PROD_BASE_PATH = process.env.VITE_BASE_PATH || '/wedding-invitation/';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : PROD_BASE_PATH,
}));
