// ============================================================
// COMPONENTE: RegisterModal
// Modal para que un SuperAdmin pueda crear nuevos usuarios
// con rol Delegado, SuperAdmin o Espectador (Proyector).
// ============================================================

import React from "react";

/**
 * @param {boolean} show - Si es true, muestra el modal
 * @param {Function} onClose - Callback para cerrar el modal
 * @param {Object} registerData - Estado del formulario { username, password, role }
 * @param {Function} setRegisterData - Setter del estado del formulario
 * @param {Function} onSubmit - Callback al enviar el formulario
 */
export default function RegisterModal({
  show,
  onClose,
  registerData,
  setRegisterData,
  onSubmit,
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 text-gray-800">
        <h2 className="text-xl font-bold mb-4 text-center">
          Registrar Nuevo Usuario
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Nombre de usuario */}
          <input
            type="text"
            placeholder="Nuevo Usuario"
            className="w-full p-2 border rounded"
            value={registerData.username}
            onChange={(e) =>
              setRegisterData({ ...registerData, username: e.target.value })
            }
            required
          />

          {/* Contraseña */}
          <input
            type="password"
            placeholder="Contraseña"
            className="w-full p-2 border rounded"
            value={registerData.password}
            onChange={(e) =>
              setRegisterData({ ...registerData, password: e.target.value })
            }
            required
          />

          {/* Selector de rol */}
          <select
            className="w-full p-2 border rounded"
            value={registerData.role}
            onChange={(e) =>
              setRegisterData({ ...registerData, role: e.target.value })
            }
          >
            <option value="Delegado">Delegado (Organizador)</option>
            <option value="SuperAdmin">Súper Administrador</option>
            <option value="Espectador">
              Pantalla Proyector (Solo Lectura)
            </option>
          </select>

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
              className="w-2/3 bg-wca-green text-white font-bold py-2 rounded hover:bg-green-600"
            >
              Crear Cuenta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
