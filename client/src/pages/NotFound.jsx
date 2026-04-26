import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-almeria-dark flex flex-col items-center justify-center text-center px-8 gap-6">
      <p className="text-8xl font-black text-almeria-orange">404</p>
      <h1 className="text-2xl font-bold text-white">Esta página no existe</h1>
      <p className="text-gray-400 max-w-sm">
        La URL que has introducido no corresponde a ninguna sección de AAS Live.
        Puede que el enlace haya cambiado o simplemente que te hayas perdido.
      </p>
      <Link
        to="/"
        className="bg-almeria-orange text-white font-bold px-6 py-3 rounded-lg hover:bg-orange-600 transition shadow-lg"
      >
        ← Volver al inicio
      </Link>
    </div>
  );
}
