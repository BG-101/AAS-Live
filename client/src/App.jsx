// ============================================================
// COMPONENTE RAÍZ (App.jsx)
// Define las rutas principales de la aplicación con React Router.
// ============================================================

import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import CompetitionDetails from "./pages/CompetitionDetails";
import Projector from "./pages/Projector";
import SeriesSOR from "./pages/SeriesSOR";
import ToastContainer from "./components/ToastContainer";
import NotFound from "./pages/NotFound";

const APP_VERSION = __APP_VERSION__;

function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        {/* Página principal: lista de competiciones y formulario de creación */}
        <Route path="/" element={<Home />} />

        {/* Detalle de una competición: gestión de competidores, tiempos y resultados */}
        <Route path="/competition/:wcaId" element={<CompetitionDetails />} />

        {/* Vista de proyector: pantalla de resultados en vivo para mostrar en un monitor */}
        <Route path="/projector/:wcaId/:event/:round" element={<Projector />} />

        <Route path="/series/:seriesName/sor" element={<SeriesSOR />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <div className="fixed bottom-1 left-2 text-[10px] text-gray-500 z-10 pointer-events-none select-none">
        v{APP_VERSION}
      </div>
    </>
  );
}

export default App;
