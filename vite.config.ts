import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : le build fonctionne depuis n'importe quel hébergement statique (GitHub Pages, etc.)
export default defineConfig({
  plugins: [react()],
  base: './',
})
