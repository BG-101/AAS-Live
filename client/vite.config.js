// ============================================================
// CONFIGURACI?N: vite.config
// Define la configuraci?n de herramientas y compilaci?n del proyecto.
// ============================================================

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
