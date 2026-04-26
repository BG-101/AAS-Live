// Sistema de toasts ligero sin dependencias externas
// Funciona con un setter global registrado por ToastContainer
let _setToasts = null;

export const registerToastSetter = (fn) => {
  _setToasts = fn;
};

/**
 * Dispara un toast.
 * @param {string} message - Texto a mostrar
 * @param {'success'|'error'|'info'} type
 * @param {number} duration - Milisegundos antes de desaparecer
 */
export const toast = (message, type = "success", duration = 3000) => {
  if (!_setToasts) return;
  const id = Date.now() + Math.random();
  _setToasts((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts((prev) => prev.filter((t) => t.id !== id));
  }, duration);
};
