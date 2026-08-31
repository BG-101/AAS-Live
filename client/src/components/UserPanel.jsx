// ============================================================
// COMPONENTE: UserPanel
// Panel SuperAdmin: lista los usuarios del sistema y permite
// resetear su contraseña (generada o personalizada).
// ============================================================

import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../utils/api";
import { toast } from "../utils/toast";

export default function UserPanel({ show, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState(null);
  const [revealedPassword, setRevealedPassword] = useState(null); // { username, password }

  // Reset durante el render al abrir el panel
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setLoading(true);
      setRevealedPassword(null);
    }
  }

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    axios
      .get(`${API_URL}/api/auth/users`)
      .then((res) => {
        if (!cancelled) setUsers(res.data);
      })
      .catch(() => {
        if (!cancelled) toast("Error cargando usuarios", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!show) return null;

  const handleReset = async (user) => {
    const custom = window.prompt(
      `Nueva contraseña para "${user.username}" (mín. 8 caracteres).\nDeja vacío para generar una aleatoria automáticamente:`,
    );
    if (custom === null) return; // Cancelado

    setResettingId(user._id);
    try {
      const payload = custom.trim() ? { newPassword: custom.trim() } : {};
      const { data } = await axios.patch(
        `${API_URL}/api/auth/users/${user._id}/reset-password`,
        payload,
      );
      if (data.newPassword) {
        setRevealedPassword({
          username: user.username,
          password: data.newPassword,
        });
      } else {
        setRevealedPassword({
          username: user.username,
          password: custom.trim(),
        });
      }
      toast(data.message, "success");
    } catch (err) {
      toast(err.response?.data?.message || "Error al resetear", "error");
    } finally {
      setResettingId(null);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(revealedPassword.password);
      toast("Contraseña copiada", "info");
    } catch {
      toast("No se pudo copiar; selecciona y copia a mano", "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-lg shrink-0">
          <h2 className="text-2xl font-bold text-gray-800">
            👥 Usuarios del Sistema
          </h2>
          <button
            onClick={onClose}
            className="text-red-500 font-bold text-3xl leading-none hover:text-red-700"
          >
            &times;
          </button>
        </div>

        {revealedPassword && (
          <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-300 rounded p-3">
            <p className="text-xs font-bold text-yellow-700 mb-1">
              🔑 Nueva contraseña de "{revealedPassword.username}" (cópiala
              ahora)
            </p>
            <div
              className="bg-white border rounded p-2 text-sm font-mono break-all text-yellow-900 select-all cursor-copy"
              onClick={copyPassword}
            >
              {revealedPassword.password}
            </div>
            <p className="text-[10px] text-yellow-600 mt-1">
              No se mostrará de nuevo. Comunícasela al usuario por un canal
              seguro.
            </p>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <p className="text-center text-gray-400 py-10">Cargando...</p>
          ) : (
            <table className="w-full text-sm text-left text-black">
              <thead className="bg-gray-800 text-white sticky top-0">
                <tr>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Rol</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-gray-50">
                    <td className="p-3 font-bold">{u.username}</td>
                    <td className="p-3">{u.role}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleReset(u)}
                        disabled={resettingId === u._id}
                        className="bg-gray-800 text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50 transition"
                      >
                        {resettingId === u._id
                          ? "..."
                          : "🔑 Resetear contraseña"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
