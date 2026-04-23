// ============================================================
// COMPONENTE: LoginModal
// Modal de inicio de sesión con campos de usuario y contraseña.
// Se muestra cuando el usuario hace clic en "Acceso Organización".
// ============================================================

import React from "react";

/**
 * @param {boolean} show - Si es true, muestra el modal
 * @param {Function} onClose - Callback para cerrar el modal
 * @param {Object} loginData - Estado del formulario { username, password }
 * @param {Function} setLoginData - Setter del estado del formulario
 * @param {Function} onSubmit - Callback al enviar el formulario (maneja la lógica de login)
 */
export default function LoginModal({
  show,
  onClose,
  loginData,
  setLoginData,
  onSubmit,
}) {
  // No renderiza nada si el modal no está activo
  if (!show) return null;

  return (
    // Overlay oscuro con el modal centrado
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 text-gray-800">
        <h2 className="text-2xl font-bold mb-4 text-center">Inicia Sesión</h2>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Campo de usuario */}
          <input
            type="text"
            placeholder="Usuario"
            className="w-full p-2 border rounded"
            value={loginData.username}
            onChange={(e) =>
              setLoginData({ ...loginData, username: e.target.value })
            }
            required
          />

          {/* Campo de contraseña */}
          <input
            type="password"
            placeholder="Contraseña"
            className="w-full p-2 border rounded"
            value={loginData.password}
            onChange={(e) =>
              setLoginData({ ...loginData, password: e.target.value })
            }
            required
          />

          {/* Botones de acción */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 bg-gray-200 font-bold py-2 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="w-2/3 bg-almeria-orange text-white font-bold py-2 rounded hover:bg-orange-600"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
