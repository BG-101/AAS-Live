// ============================================================
// CONFIGURACI?N: vite.config
// Define la configuraci?n de herramientas y compilaci?n del proyecto.
// ============================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const appVersion = process.env.VITE_APP_VERSION || pkg.version;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
