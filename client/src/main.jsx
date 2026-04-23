// ============================================================
// PUNTO DE ENTRADA DEL CLIENTE (main.jsx)
// Configura React, React Router, Axios y monta la app.
// ============================================================

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import axios from "axios";

// Configura Axios para enviar cookies automáticamente en cada petición.
// Necesario para que el JWT httpOnly se envíe al servidor.
axios.defaults.withCredentials = true;

// Interceptor global de respuestas de Axios.
// Si el servidor devuelve un 401 (token inválido/expirado),
// lanza un evento personalizado "auth-expired" para que los
// componentes puedan reaccionar (ej: ocultar UI de admin).
axios.interceptors.response.use(
  (response) => response, // Las respuestas exitosas pasan sin cambios
  (error) => {
    if (error.response && error.response.status === 401) {
      // Emite un evento global que los componentes escuchan para limpiar el estado de auth
      window.dispatchEvent(new Event("auth-expired"));
    }
    return Promise.reject(error); // Propaga el error para que los catch individuales funcionen
  },
);

// Renderiza la aplicación React en el div#root del index.html
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* BrowserRouter activa el enrutamiento con URLs limpias (sin #) */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
