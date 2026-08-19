import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base '/' : les sections sont de vrais chemins (/journal, /collections). Une
// base relative ferait chercher les assets sous /journal/assets/ — introuvables.
export default defineConfig({
  plugins: [react()],
  base: '/',
})
