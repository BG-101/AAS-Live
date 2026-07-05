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

function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        {/* Página principal: lista de competiciones y formulario de creación */}
        <Route path="/" element={<Home />} />

        {/* Detalle de una competición: gestión de competidores, tiempos y resultados */}
        <Route path="/competition/:id" element={<CompetitionDetails />} />

        {/* Vista de proyector: pantalla de resultados en vivo para mostrar en un monitor */}
        <Route path="/projector/:id/:event/:round" element={<Projector />} />

        <Route path="/series/:seriesName/sor" element={<SeriesSOR />} />

        <Route path="*" element={<NotFound />} /> 
      </Routes>
    </>
  );
}

export default App;
