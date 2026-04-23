// URL base de la API según el entorno
// En desarrollo apunta a localhost, en producción al backend de Render
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';