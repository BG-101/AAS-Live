import { useState, useEffect } from "react";
import { registerToastSetter } from "../utils/toast";

const STYLES = {
  success: "bg-wca-green text-white",
  error: "bg-red-600 text-white",
  info: "bg-blue-600 text-white",
};

const ICONS = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    registerToastSetter(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-2xl font-bold text-sm max-w-xs animate-slide-up ${STYLES[t.type]}`}
        >
          <span>{ICONS[t.type]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
