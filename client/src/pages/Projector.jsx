// ============================================================
// PÁGINA: Projector
// Vista optimizada para mostrar en un monitor/proyector durante
// una competición. Muestra resultados en tiempo real con:
// - Modo Lista: tabla con auto-scroll continuo
// - Modo Podio: animación de los top 3 con efecto de aparición
//
// Se conecta por WebSocket para recibir actualizaciones instantáneas
// y alterna automáticamente entre ambos modos cuando la ronda final
// se cierra (muestra el podio animado y vuelve a la lista).
// ============================================================

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { createSocket } from "../utils/socket";
import { formatTime, formatWCATimesArray } from "../utils/formatters";
import { API_URL } from "../utils/api";

function Projector() {
  // Parámetros de la URL: /projector/:id/:event/:round
  const { id, event, round } = useParams();
  const roundNum = Number(round);

  // --- Estado ---
  const [competition, setCompetition] = useState(null);
  const [results, setResults] = useState([]);
  const [competitors, setCompetitors] = useState([]); // Para calcular progreso

  const [viewMode, setViewMode] = useState("list"); // "list" o "podium"
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Fuerza recarga de datos
  const [isConnected, setIsConnected] = useState(false); // Estado de conexión WebSocket

  // Refs para el WebSocket (almacenan valores sin re-renderizar)
  const eventRef = useRef(event);
  const roundRef = useRef(round);

  const navigate = useNavigate();

  useEffect(() => {
    eventRef.current = event;
  }, [event]);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  // ============================================================
  // EFECTO: Cargar datos de la competición
  // ============================================================
  useEffect(() => {
    axios
      .get(`${API_URL}/api/competitions/${id}`)
      .then((res) => setCompetition(res.data))
      .catch(console.error);
  }, [id, refreshTrigger]);

  // ============================================================
  // EFECTO: Cargar resultados de la ronda
  // ============================================================
  useEffect(() => {
    setResults([]);
    axios
      .get(`${API_URL}/api/results/${id}/${event}/${roundNum}`)
      .then((res) => setResults(res.data))
      .catch((err) => console.error(err));
  }, [id, event, roundNum, refreshTrigger]);

  // ============================================================
  // EFECTO: Cargar competidores elegibles (para el contador de progreso)
  // ============================================================
  useEffect(() => {
    setCompetitors([]);
    axios
      .get(`${API_URL}/api/competitors/${id}/eligible/${event}/${roundNum}`)
      .then((res) => setCompetitors(res.data))
      .catch(console.error);
  }, [id, event, roundNum, refreshTrigger]);

  // ============================================================
  // EFECTO: Conexión WebSocket para actualización en tiempo real
  // Escucha cambios de resultados y configuración de la competición.
  // ============================================================
  useEffect(() => {
    const socket = createSocket();

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("resultado_actualizado", (data) => {
      if (
        data.competitionId === id &&
        data.event === eventRef.current &&
        data.round === roundNum
      ) {
        setRefreshTrigger((prev) => prev + 1);
      }
    });

    socket.on("competicion_actualizada", (compId) => {
      if (compId === id) setRefreshTrigger((prev) => prev + 1);
    });

    socket.on("proyector_logout", async () => {
      try {
        await axios.post(`${API_URL}/api/auth/logout`);
      } catch {
        /* silencioso */
      }
      // Redirige al inicio independientemente del resultado del logout
      window.location.href = "/";
    });

    return () => socket.disconnect();
  }, [id]);

  // ============================================================
  // EFECTO: Temporizador del modo podio
  // Cuando se muestra el podio en una ronda final cerrada,
  // vuelve automáticamente al modo lista después de 10 segundos.
  // ============================================================
  useEffect(() => {
    const currentRoundObj = competition?.rounds.find(
      (r) => r.event === event && r.roundNumber === roundNum,
    );
    const isFinished = currentRoundObj?.status === "Finished";
    const isFinalRound = parseInt(currentRoundObj?.advancementValue) === 0;

    if (viewMode === "podium" && isFinished && isFinalRound) {
      const timer = setTimeout(() => {
        setViewMode("list");
      }, 10000); // 10 segundos
      return () => clearTimeout(timer);
    }
  }, [viewMode, competition, event, roundNum]);

  // ============================================================
  // EFECTO: Auto-scroll en modo lista
  // Hace scroll lento hacia abajo continuamente. Cuando llega al
  // fondo, espera 8 segundos y luego:
  // - Si es ronda final cerrada: cambia a modo podio
  // - Si no: vuelve al inicio y repite el ciclo
  // ============================================================
  useEffect(() => {
    if (viewMode !== "list") return;
    const container = document.getElementById("projector-scroll");
    if (!container) return;

    // Empieza desde arriba
    container.scrollTo({ top: 0 });

    let isPaused = false;
    const scrollInterval = setInterval(() => {
      if (isPaused) return;

      // Detecta si ha llegado al fondo
      if (
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - 1
      ) {
        isPaused = true;

        // Espera 8 segundos al llegar al fondo
        setTimeout(() => {
          const currentRoundObj = competition?.rounds.find(
            (r) => r.event === event && r.roundNumber === roundNum,
          );
          const isFinished = currentRoundObj?.status === "Finished";
          const isFinalRound =
            parseInt(currentRoundObj?.advancementValue) === 0;

          if (isFinished && isFinalRound) {
            // Ronda final cerrada: muestra el podio
            setViewMode("podium");
          } else {
            // Vuelve al inicio suavemente y espera 4s antes de reanudar
            container.scrollTo({ top: 0, behavior: "smooth" });
            setTimeout(() => {
              isPaused = false;
            }, 4000);
          }
        }, 8000);
      } else {
        // Scroll lento: 1 píxel cada 30ms ≈ 33px/s
        container.scrollBy(0, 1);
      }
    }, 30);

    return () => clearInterval(scrollInterval);
  }, [viewMode, results.length, competition, event, roundNum]);

  /** Alterna entre pantalla completa y ventana normal */
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .catch((err) => console.log(err));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  // ============================================================
  // PANTALLA DE CARGA
  // ============================================================
  if (!competition)
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center text-4xl font-bold">
        Cargando transmisión en vivo...
      </div>
    );

  // ============================================================
  // DATOS DERIVADOS
  // ============================================================
  const currentRoundObj = competition.rounds.find(
    (r) => r.event === event && r.roundNumber === roundNum,
  );
  const roundFormat = currentRoundObj?.format || "a";
  const isFinished = currentRoundObj?.status === "Finished";
  const isFinalRound = currentRoundObj?.advancementValue === 0;
  const attemptsCount = roundFormat === "a" ? 5 : 3;

  // Estadísticas de progreso
  const participantes = competitors.length;
  const participantesConResultado = results.length;
  const faltantes = participantes - participantesConResultado;

  // Cálculo de clasificados
  let participantesQueClasifican = 0;
  if (Number(currentRoundObj?.advancementValue) === 0)
    participantesQueClasifican = 0;
  else if (currentRoundObj?.advancementType === "ranking")
    participantesQueClasifican = Math.min(
      currentRoundObj.advancementValue,
      participantes,
    );
  else if (currentRoundObj?.advancementType === "percent")
    participantesQueClasifican = Math.floor(
      participantes * (currentRoundObj.advancementValue / 100),
    );

  // ============================================================
  // MODO PODIO
  // Muestra los top 3 con animaciones de aparición.
  // Los colores cambian según si la ronda está finalizada o no:
  // - Finalizada: oro, plata, bronce
  // - En curso: tonos azules (provisional)
  // ============================================================
  if (viewMode === "podium") {
    const top3 = results.slice(0, 3);
    const gold = top3[0]; // 🥇 Primer lugar
    const silver = top3[1]; // 🥈 Segundo lugar
    const bronze = top3[2]; // 🥉 Tercer lugar

    // --- Estilos condicionales según si la ronda está cerrada o no ---

    // Estilos para el primer lugar
    const goldBox = isFinished
      ? "bg-yellow-500 border-yellow-300 shadow-[0_0_80px_rgba(234,179,8,0.6)]"
      : "bg-blue-600 border-blue-400 shadow-[0_0_80px_rgba(37,99,235,0.6)]";
    const goldText = isFinished
      ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]"
      : "text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]";
    const goldNum = isFinished ? "text-yellow-700" : "text-blue-800";

    // Estilos para el segundo lugar
    const silverBox = isFinished
      ? "bg-gray-300 border-gray-400 shadow-[0_0_50px_rgba(209,213,219,0.5)]"
      : "bg-blue-500 border-blue-400 shadow-[0_0_50px_rgba(59,130,246,0.5)]";
    const silverText = isFinished ? "text-gray-200" : "text-blue-200";
    const silverNum = isFinished ? "text-gray-500" : "text-blue-700";

    // Estilos para el tercer lugar
    const bronzeBox = isFinished
      ? "bg-orange-700 border-orange-500 shadow-[0_0_50px_rgba(194,65,12,0.5)]"
      : "bg-blue-700 border-blue-500 shadow-[0_0_50px_rgba(29,78,216,0.5)]";
    const bronzeText = isFinished ? "text-orange-400" : "text-blue-400";
    const bronzeNum = isFinished ? "text-orange-900" : "text-blue-900";

    return (
      <div className="h-screen bg-black text-white flex flex-col relative overflow-hidden">
        {/* Animaciones CSS para el efecto de aparición del podio */}
        <style>{`
          @keyframes slideUp { 0% { transform: translateY(100%); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
          @keyframes popIn { 0% { transform: scale(0) translateY(50px); opacity: 0; } 80% { transform: scale(1.1) translateY(-10px); opacity: 1; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        `}</style>

        {/* Cabecera del podio */}
        <div className="text-center p-10 bg-gray-900 border-b-8 border-almeria-orange z-10">
          <h1 className="text-6xl font-black uppercase tracking-widest text-almeria-orange">
            {competition.name}
          </h1>
          <h2 className="text-4xl font-bold mt-4 text-gray-300">
            {isFinished
              ? `Podio - Evento ${event}`
              : `Podio Provisional - Evento ${event}`}
          </h2>
        </div>

        {/* Podio con los 3 lugares */}
        <div className="flex-1 flex items-end justify-center pb-20 gap-8 px-10">
          {/* 🥈 Segundo lugar (izquierda, aparece primero) */}
          {silver && (
            <div className="w-1/3 flex flex-col items-center">
              <div
                className="text-center mb-6"
                style={{
                  animation:
                    "popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                  opacity: 0,
                  animationDelay: "0.8s",
                }}
              >
                <p className={`text-5xl font-black ${silverText}`}>
                  {silver.competitor.name}
                </p>
                <p className="text-3xl text-gray-400 font-mono mt-2 font-bold">
                  {formatTime(
                    roundFormat === "b" ? silver.best : silver.average,
                  )}
                </p>
              </div>
              <div
                className={`w-full ${silverBox} h-64 rounded-t-lg border-t-8 flex justify-center items-start pt-6`}
                style={{
                  animation:
                    "slideUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  opacity: 0,
                  animationDelay: "0.8s",
                }}
              >
                <span className={`text-6xl font-black ${silverNum}`}>2</span>
              </div>
            </div>
          )}

          {/* 🥇 Primer lugar (centro, aparece último, más alto) */}
          {gold && (
            <div className="w-1/3 flex flex-col items-center z-10">
              <div
                className="text-center mb-6"
                style={{
                  animation:
                    "popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                  opacity: 0,
                  animationDelay: "1.5s",
                }}
              >
                <p className={`text-6xl font-black ${goldText}`}>
                  {gold.competitor.name}
                </p>
                <p className="text-4xl text-gray-300 font-mono mt-2 font-bold">
                  {formatTime(roundFormat === "b" ? gold.best : gold.average)}
                </p>
              </div>
              <div
                className={`w-full ${goldBox} h-96 rounded-t-lg border-t-8 flex justify-center items-start pt-6`}
                style={{
                  animation:
                    "slideUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  opacity: 0,
                  animationDelay: "1.5s",
                }}
              >
                <span className={`text-8xl font-black ${goldNum}`}>1</span>
              </div>
            </div>
          )}

          {/* 🥉 Tercer lugar (derecha, aparece primero, más bajo) */}
          {bronze && (
            <div className="w-1/3 flex flex-col items-center">
              <div
                className="text-center mb-6"
                style={{
                  animation:
                    "popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                  opacity: 0,
                  animationDelay: "0.2s",
                }}
              >
                <p className={`text-4xl font-black ${bronzeText}`}>
                  {bronze.competitor.name}
                </p>
                <p className="text-3xl text-gray-400 font-mono mt-2 font-bold">
                  {formatTime(
                    roundFormat === "b" ? bronze.best : bronze.average,
                  )}
                </p>
              </div>
              <div
                className={`w-full ${bronzeBox} h-48 rounded-t-lg border-t-8 flex justify-center items-start pt-6`}
                style={{
                  animation:
                    "slideUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  opacity: 0,
                  animationDelay: "0.2s",
                }}
              >
                <span className={`text-5xl font-black ${bronzeNum}`}>3</span>
              </div>
            </div>
          )}
        </div>

        {/* Controles flotantes: pantalla completa y cambio de vista */}
        <div className="absolute bottom-4 right-4 flex gap-2 z-50">
          <button
            onClick={toggleFullscreen}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded backdrop-blur transition text-xl"
          >
            ⛶
          </button>
          <button
            onClick={() => setViewMode("list")}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded backdrop-blur transition font-bold"
          >
            Cambiar a Lista
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // MODO LISTA
  // Tabla de resultados con auto-scroll. Muestra todos los
  // resultados con colores de clasificación y podio.
  // ============================================================
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white relative">
      {/* Cabecera con info de la ronda y estado de conexión */}
      <div className="bg-black border-b-4 border-almeria-orange p-6 shadow-2xl shrink-0">
        {/* Indicador de progreso (completados / total) */}
        <div className="absolute top-6 right-48 flex items-center bg-gray-800 px-4 py-1.5 rounded-full border border-gray-600">
          <span className="text-sm font-bold tracking-widest text-almeria-orange">
            COMPLETADO: {participantesConResultado} / {participantes}
          </span>
        </div>

        {/* Indicador de conexión WebSocket */}
        <div className="absolute top-6 right-8 flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-gray-700 backdrop-blur">
          <span
            className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" : "bg-red-500"}`}
          ></span>
          <span className="text-xs font-bold tracking-widest text-gray-300">
            {isConnected ? "EN VIVO" : "DESCONECTADO"}
          </span>
        </div>

        <h1 className="text-4xl font-bold uppercase">{competition.name}</h1>
        <h2 className="text-2xl text-almeria-orange mt-2">
          Evento {event} - Ronda {round}{" "}
          {isFinished ? "(FINALIZADA)" : "(EN VIVO)"}
        </h2>
        {competition.ageGroupsEnabled && !isFinished && (
          <p className="text-sm text-gray-400 mt-1">
            Competición con separación de edad · Clasificación por grupos
            visible al cerrar la ronda
          </p>
        )}
      </div>

      {/* Tabla de resultados con scroll automático */}
      <div id="projector-scroll" className="flex-1 overflow-y-auto px-8 pb-32">
        <table className="w-full text-left text-2xl relative border-collapse">
          <thead className="text-gray-400 border-b-2 border-gray-700 sticky top-0 bg-gray-900 z-40 shadow-md">
            <tr>
              <th className="py-4 w-20 text-center">#</th>
              <th className="py-4">Competidor</th>
              {/* Columnas de intentos */}
              {Array.from({ length: attemptsCount }).map((_, i) => (
                <th key={i} className="py-4 text-center">
                  {i + 1}
                </th>
              ))}
              {/* Columna de resultado */}
              <th className="py-4 text-right pr-4 text-almeria-orange">
                {roundFormat === "a"
                  ? "Ao5"
                  : roundFormat === "m"
                    ? "Mo3"
                    : "Single"}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-800">
            {results.map((res, index) => {
              // Rellena tiempos faltantes con ceros
              const paddedTimes = [...res.times];
              while (paddedTimes.length < attemptsCount) paddedTimes.push(0);
              const formattedTimes = formatWCATimesArray(
                paddedTimes,
                roundFormat,
              );

              const posicion = index + 1;

              const suppressAdvanceColors =
                competition.ageGroupsEnabled && !isFinished;

              // --- Determina el color de la fila según la posición ---
              let rowClass = "border-b border-gray-800";

              if (isFinalRound) {
                // Colores de podio para la ronda final
                if (posicion === 1)
                  rowClass = isFinished
                    ? "bg-yellow-600/30 text-yellow-300 font-bold" // 🥇
                    : "bg-blue-600/30 text-blue-300 font-bold";
                else if (posicion === 2)
                  rowClass = isFinished
                    ? "bg-gray-400/30 text-gray-300 font-bold" // 🥈
                    : "bg-blue-500/30 text-blue-200 font-bold";
                else if (posicion === 3)
                  rowClass = isFinished
                    ? "bg-orange-700/40 text-orange-400 font-bold" // 🥉
                    : "bg-blue-400/30 text-blue-200 font-bold";
              } else if (!suppressAdvanceColors && res.advances) {
                // Colores de clasificación para rondas no finales
                if (isFinished)
                  rowClass = "bg-wca-green/20"; // Clasificado confirmado
                else {
                  rowClass =
                    posicion + faltantes <= participantesQueClasifican
                      ? "bg-wca-green/20"
                      : "bg-blue-600/20";
                }
              }

              return (
                <tr key={res._id} className={rowClass}>
                  <td className="py-6 text-center font-bold text-gray-500">
                    {posicion}
                  </td>
                  <td className="py-6 font-bold">{res.competitor.name}</td>
                  {formattedTimes.map((t, i) => (
                    <td
                      key={i}
                      className={`py-6 text-center text-xl ${t?.includes("(") ? "text-gray-500" : "font-medium"}`}
                    >
                      {t}
                    </td>
                  ))}
                  <td className="py-6 text-right font-black font-mono text-3xl pr-4">
                    {formatTime(roundFormat === "b" ? res.best : res.average)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Controles flotantes */}
      <div className="fixed bottom-4 right-4 flex gap-2 z-50">
        <button
          onClick={toggleFullscreen}
          className="bg-black/50 hover:bg-black/80 text-white px-4 py-2 rounded backdrop-blur transition text-xl"
        >
          ⛶
        </button>
        <button
          onClick={() => setViewMode("podium")}
          className="bg-black/50 hover:bg-black/80 text-white px-4 py-2 rounded backdrop-blur transition font-bold"
        >
          Cambiar a Podio
        </button>
      </div>
    </div>
  );
}

export default Projector;
