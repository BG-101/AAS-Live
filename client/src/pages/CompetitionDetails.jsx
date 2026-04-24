// ============================================================
// PÁGINA: CompetitionDetails
// Vista principal de gestión de una competición específica.
// Permite registrar competidores, ingresar tiempos, ver resultados
// en tiempo real y gestionar rondas.
//
// Layout:
// - Cabecera: info de la competición + controles de autenticación
// - Columna izquierda (solo admin): formulario de competidores + tiempos
// - Columna derecha: pestañas de eventos, rondas y tabla de resultados
// ============================================================

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

import LoginModal from "../components/LoginModal";
import AuditModal from "../components/AuditModal";
import RoundSettingsModal from "../components/RoundSettingsModal";
import ResultsTable from "../components/ResultsTable";
import TimeEntryForm from "../components/TimeEntryForm";
import SORTable from "../components/SORTable";
import CompetitorEditorModal from "../components/CompetitorEditorModal";
import { API_URL } from "../utils/api";

import {
  formatTime,
  parseTimeInput,
  parseCutoff,
  formatCutoff,
  formatWCATimesArray,
  formatDateRange,
} from "../utils/formatters";

const AGE_GROUPS_CLIENT = {
  alevin: { label: "Alevín (<=10)", maxAge: 10 },
  infantil: { label: "Infantil (11-15)", minAge: 11, maxAge: 15 },
  absoluta: { label: "Absoluta (>=16)", minAge: 16 },
};

const isInAgeGroup = (competitor, groupKey) => {
  if (!groupKey) return true;
  const group = AGE_GROUPS_CLIENT[groupKey];
  const age = competitor?.age;
  if (age === null || age === undefined) return false;
  if (group.minAge !== undefined && group.maxAge !== undefined)
    return age >= group.minAge && age <= group.maxAge;
  if (group.maxAge !== undefined) return age <= group.maxAge;
  if (group.minAge !== undefined) return age >= group.minAge;
  return false;
};

function CompetitionDetails() {
  // Obtiene el ID de la competición desde la URL (/competition/:id)
  const { id } = useParams();
  const navigate = useNavigate();

  // ============================================================
  // ESTADO DE AUTENTICACIÓN
  // Se inicializa desde localStorage para evitar un flash de UI sin login,
  // pero se sobreescribe inmediatamente con la verificación del servidor.
  // ============================================================
  const [user, setUser] = useState(null);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(true);

  // Flags de permisos derivados del rol
  const isWritableAdmin =
    user?.role === "SuperAdmin" || user?.role === "Delegado"; // Puede escribir datos
  const isProjector = user?.role === "Espectador"; // Solo muestra datos (modo proyector)

  // --- Estado de modales ---
  const [showLogin, setShowLogin] = useState(false);
  const [loginData, setLoginData] = useState({ username: "", password: "" });

  // --- Estado de la competición ---
  const [competition, setCompetition] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(""); // Evento actualmente seleccionado
  const [selectedRound, setSelectedRound] = useState(1); // Número de ronda seleccionada

  // --- Estado de datos ---
  const [competitors, setCompetitors] = useState([]); // Competidores elegibles para la ronda
  const [results, setResults] = useState([]); // Resultados de la ronda actual

  // --- Estado del formulario de nuevo competidor ---
  const [newCompetitor, setNewCompetitor] = useState({
    name: "",
    wcaId: "",
    age: "",
    locality: "",
    events: [],
  });

  // --- Estado del formulario de tiempos ---
  const [selectedCompetitorId, setSelectedCompetitorId] = useState("");
  const [inputTimes, setInputTimes] = useState(["", "", "", "", ""]);

  // --- Contadores de refresco (se incrementan para forzar recarga de datos) ---
  const [refreshCompetitions, setRefreshCompetitions] = useState(0);
  const [refreshCompetitors, setRefreshCompetitors] = useState(0);
  const [refreshResults, setRefreshResults] = useState(0);

  // --- Estado de modales de auditoría y configuración ---
  const [showLogs, setShowLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsData, setSettingsData] = useState({
    type: "percent",
    value: 75,
    format: "a",
    cutoff: "",
  });

  // --- Estado del buscador de competidores ---
  const [searchName, setSearchName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // --- Flags de carga (evitan doble-submit) ---
  const [isAddingComp, setIsAddingComp] = useState(false);
  const [isSavingTimes, setIsSavingTimes] = useState(false);

  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);

  const [showCompetitorEditor, setShowCompetitorEditor] = useState(false);

  // --- Refs para enfocar campos y navegación con teclado ---
  const inputRefs = useRef([]); // Refs de los inputs de tiempos (T1, T2, T3...)
  const searchInputRef = useRef(null); // Ref del buscador
  const submitBtnRef = useRef(null); // Ref del botón de guardar

  // Refs para el WebSocket: almacenan el valor actual sin re-renderizar
  // (necesario porque los callbacks del socket se crean una sola vez)
  const eventRef = useRef(selectedEvent);
  const roundRef = useRef(selectedRound);

  // Mantiene los refs sincronizados con el estado
  useEffect(() => {
    eventRef.current = selectedEvent;
  }, [selectedEvent]);
  useEffect(() => {
    roundRef.current = selectedRound;
  }, [selectedRound]);

  // ============================================================
  // EFECTO: Verificación de autenticación
  // Consulta el servidor al cargar y escucha eventos de expiración.
  // ============================================================
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/auth/me`);
        setUser({ role: res.data.role, username: res.data.username });
      } catch {
        setUser(null);
      } finally {
        setIsVerifyingAuth(false);
        // Limpieza de localStorage legacy (eliminar tras un ciclo de versiones)
        localStorage.removeItem("userRole");
        localStorage.removeItem("userName");
      }
    };
    verifyAuth();

    const handleAuthExpired = () => {
      setUser(null);
      setIsVerifyingAuth(false);
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);

  // ============================================================
  // EFECTO: Auto-seleccionar el evento al cambiar
  // Cuando cambia el evento seleccionado, actualiza los eventos
  // del formulario de nuevo competidor para inscribirlo automáticamente.
  // ============================================================
  useEffect(() => {
    if (selectedEvent)
      setNewCompetitor((prev) => ({ ...prev, events: [selectedEvent] }));
  }, [selectedEvent]);

  // ============================================================
  // EFECTO: Cargar datos de la competición
  // Se recarga cuando cambia el ID o se actualiza la competición.
  // ============================================================
  useEffect(() => {
    axios
      .get(`${API_URL}/api/competitions/${id}`)
      .then((res) => {
        setCompetition(res.data);
        // Selecciona el primer evento si no hay uno ya seleccionado
        if (res.data.events && res.data.events.length > 0)
          setSelectedEvent((prev) => (prev ? prev : res.data.events[0]));
      })
      .catch((e) => {
        // Si la competición no existe (404), redirige al inicio
        if (e.response?.status === 404) navigate("/");
      });
  }, [id, refreshCompetitions, navigate]);

  // ============================================================
  // EFECTO: Cargar competidores elegibles para la ronda actual
  // Los elegibles dependen de la ronda: en R1 todos, en R2+ solo los que avanzaron.
  // ============================================================
  useEffect(() => {
    if (!selectedEvent || !selectedRound) return;
    setSelectedAgeGroup(null);
    setCompetitors([]); // Limpia mientras carga
    axios
      .get(
        `${API_URL}/api/competitors/${id}/eligible/${selectedEvent}/${selectedRound}`,
      )
      .then((res) => {
        setCompetitors(res.data);
        setSelectedCompetitorId("");
        setSearchName("");
      })
      .catch(console.error);
  }, [id, selectedEvent, selectedRound, refreshCompetitors]);

  // ============================================================
  // EFECTO: Cargar resultados de la ronda actual
  // ============================================================
  useEffect(() => {
    if (!selectedEvent || !selectedRound) return;
    setResults([]); // Limpia mientras carga
    axios
      .get(`${API_URL}/api/results/${id}/${selectedEvent}/${selectedRound}`)
      .then((res) => {
        setResults(res.data);
      })
      .catch(console.error);
  }, [id, selectedEvent, selectedRound, refreshResults]);

  // ============================================================
  // EFECTO: Auto-refresco de resultados cada 30s (solo para espectadores)
  // Los admins no lo necesitan porque reciben updates por WebSocket.
  // ============================================================
  useEffect(() => {
    if (isWritableAdmin || !selectedEvent) return;
    const interval = setInterval(
      () => setRefreshResults((prev) => prev + 1),
      30000,
    );
    return () => clearInterval(interval);
  }, [isWritableAdmin, selectedEvent, selectedRound]);

  // ============================================================
  // EFECTO: Conexión WebSocket para actualizaciones en tiempo real
  // Escucha dos tipos de eventos:
  // - "resultado_actualizado": se actualizó un tiempo en esta ronda
  // - "competicion_actualizada": cambió la configuración de la competición
  // ============================================================
  useEffect(() => {
    const socket = io("https://aas-live.onrender.com", {
      withCredentials: true,
    });

    socket.on("resultado_actualizado", (data) => {
      // Solo refresca si es para esta competición, evento y ronda
      if (
        data.competitionId === id &&
        data.event === eventRef.current &&
        data.round === roundRef.current
      ) {
        if (data.results) {
          // Actualización directa sin GET adicional
          setResults(data.results);
        } else {
          // Fallback: fuerza recarga si el servidor no envió payload
          setRefreshResults((prev) => prev + 1);
        }
      }
    });

    socket.on("competicion_actualizada", (compId) => {
      if (compId === id) {
        setRefreshCompetitions((prev) => prev + 1);
        setRefreshResults((prev) => prev + 1);
      }
    });

    return () => socket.disconnect();
  }, [id]);

  // ============================================================
  // HANDLERS DE AUTENTICACIÓN
  // ============================================================

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, loginData);
      setUser({ role: res.data.role, username: res.data.username });
      setShowLogin(false);
      setLoginData({ username: "", password: "" });
    } catch (err) {
      alert(err.response?.data?.message || "Error al iniciar sesión");
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`);
      setUser(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ============================================================
  // HANDLER: Seleccionar un competidor del dropdown
  // Si ya tiene tiempos registrados, los carga en los inputs.
  // ============================================================
  const handleSelectCompetitor = (compId, compName) => {
    setSelectedCompetitorId(compId);
    setSearchName(compName || "");
    setShowDropdown(false);

    // Busca si este competidor ya tiene resultados en esta ronda
    const existingResult = results.find((r) => r.competitor._id === compId);
    if (existingResult) {
      // Carga los tiempos existentes en los inputs formateados
      const timesStr = [...existingResult.times, 0, 0, 0, 0, 0]
        .map((t) => formatTime(t))
        .slice(0, attemptsCount); // Usa attemptsCount correcto según el formato
      setInputTimes(timesStr);
    } else {
      // Sin resultados: limpia los inputs
      setInputTimes(["", "", "", "", ""]);
    }

    // Enfoca el primer input de tiempos con un pequeño delay
    setTimeout(() => {
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    }, 50);
  };

  // ============================================================
  // HANDLER: Inscribir un nuevo competidor
  // ============================================================
  const handleAddCompetitor = async (e) => {
    e.preventDefault();
    if (newCompetitor.events.length === 0)
      return alert("Selecciona al menos 1 categoría.");
    if (isAddingComp) return; // Evita doble-submit

    setIsAddingComp(true);
    try {
      await axios.post(`${API_URL}/api/competitors`, {
        ...newCompetitor,
        competitionId: id,
      });
      // Limpia el formulario y recarga la lista
      setNewCompetitor({
        name: "",
        wcaId: "",
        age: "",
        locality: "",
        events: [selectedEvent],
      });
      setRefreshCompetitors((prev) => prev + 1);
    } catch (error) {
      alert(error.response?.data?.message || "Error al añadir");
    } finally {
      setIsAddingComp(false);
    }
  };

  // ============================================================
  // HANDLER: Borrar un competidor (soft delete)
  // ============================================================
  const handleDeleteCompetitor = async (compId, compName) => {
    if (
      !confirm(`⚠️ ¿Borrar a ${compName} y TODOS sus tiempos en este torneo?`)
    )
      return;
    try {
      await axios.delete(`${API_URL}/api/competitors/${compId}`);
      setRefreshCompetitors((prev) => prev + 1);
      setRefreshResults((prev) => prev + 1);
      setShowDropdown(false);
    } catch (err) {
      alert("Error eliminando");
    }
  };

  // ============================================================
  // HANDLER: Vaciar la papelera (hard delete, solo SuperAdmin)
  // ============================================================
  const handleEmptyTrash = async () => {
    if (
      !confirm(
        `⚠️ PELIGRO SUPERADMIN: ¿Estás seguro de que quieres eliminar DEFINITIVAMENTE a todos los competidores de la papelera y sus tiempos? Esta acción NO se puede deshacer.`,
      )
    )
      return;
    try {
      const res = await axios.delete(
        `${API_URL}/api/competitors/empty-trash/${id}`,
      );
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || "Error al vaciar la papelera");
    }
  };

  // ============================================================
  // DATOS DERIVADOS DE LA RONDA ACTUAL
  // Se calculan a partir de la configuración de la competición.
  // ============================================================

  // Objeto de la ronda actual (de la configuración de la competición)
  const currentRoundObj = competition?.rounds.find(
    (r) => r.event === selectedEvent && r.roundNumber === selectedRound,
  );
  const isRoundFinished = currentRoundObj?.status === "Finished";
  const roundFormat = currentRoundObj?.format || "a"; // "a" (Ao5), "m" (Mo3), "b" (Bo3)
  const roundCutoff = currentRoundObj?.cutoff || 0; // Cutoff en centésimas
  const attemptsCount = roundFormat === "a" ? 5 : 3; // Número de intentos según formato

  /**
   * Calcula el índice límite del cutoff:
   * - Ao5: los primeros 2 intentos (índice 2)
   * - Mo3/Bo3: el primer intento (índice 1)
   */
  const getCutoffLimitIndex = () => (roundFormat === "a" ? 2 : 1);

  /**
   * Comprueba si el competidor ha superado el cutoff
   * (al menos un tiempo en los intentos de cutoff es menor al cutoff)
   */
  const hasPassedCutoff = () => {
    if (roundCutoff <= 0) return true; // Sin cutoff, siempre pasa
    const limit = getCutoffLimitIndex();
    for (let i = 0; i < limit; i++) {
      const val = parseTimeInput(inputTimes[i] || "");
      if (val > 0 && val < roundCutoff) return true;
    }
    return false;
  };

  // ============================================================
  // HANDLER: Guardar tiempos
  // Parsea los inputs, envía al servidor y limpia el formulario.
  // ============================================================
  const handleSubmitTimes = async (e) => {
    e.preventDefault();
    if (!selectedCompetitorId) return alert("Selecciona un competidor.");
    if (isSavingTimes) return;
    setIsSavingTimes(true);

    // Convierte los strings de los inputs a centésimas de segundo
    const timesInCentiseconds = inputTimes
      .slice(0, attemptsCount)
      .map((t) => parseTimeInput(t));

    try {
      await axios.post(`${API_URL}/api/results`, {
        competitionId: id,
        competitorId: selectedCompetitorId,
        event: selectedEvent,
        round: selectedRound,
        times: timesInCentiseconds,
      });

      // Limpia el formulario y recarga los resultados
      setInputTimes(["", "", "", "", ""]);
      setSelectedCompetitorId("");
      setSearchName("");
      setRefreshResults((prev) => prev + 1);

      // Devuelve el foco al buscador para registro rápido
      if (searchInputRef.current) searchInputRef.current.focus();
    } catch (error) {
      alert(
        "Error crítico: " +
          (error.response?.data?.message || "Contacta al admin."),
      );
    } finally {
      setIsSavingTimes(false);
    }
  };

  /**
   * Maneja la navegación con teclado entre inputs de tiempos.
   * Enter salta al siguiente campo, o al botón de guardar si es el último.
   * Respeta el cutoff (no salta a campos bloqueados).
   */
  const handleTimeKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index < attemptsCount - 1 && !isSavingTimes) {
        // Comprueba si el siguiente campo está bloqueado por cutoff
        const isCutoffBlocked =
          roundCutoff > 0 &&
          index + 1 >= getCutoffLimitIndex() &&
          !hasPassedCutoff();

        if (!isCutoffBlocked && inputRefs.current[index + 1])
          inputRefs.current[index + 1].focus(); // Siguiente campo
        else if (submitBtnRef.current) submitBtnRef.current.focus(); // Al botón
      } else {
        if (submitBtnRef.current) submitBtnRef.current.focus();
      }
    }
  };

  // ============================================================
  // HANDLERS DE GESTIÓN DE RONDAS
  // ============================================================

  /** Crea la siguiente ronda para el evento actual */
  const handleCreateNextRound = async () => {
    if (!confirm(`¿Abrir la Ronda ${selectedRound + 1} para ${selectedEvent}?`))
      return;
    try {
      await axios.post(`${API_URL}/api/competitions/${id}/next-round`, {
        event: selectedEvent,
        currentRoundNumber: selectedRound,
      });
      setRefreshCompetitions((prev) => prev + 1);
      setSelectedRound(selectedRound + 1); // Navega a la nueva ronda
    } catch (error) {
      alert(error.response?.data?.message || "Error");
    }
  };

  /** Guarda los cambios de configuración de la ronda (formato, cutoff, avance) */
  const handleSaveRoundSettings = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/api/competitions/${id}/round-settings`, {
        event: selectedEvent,
        roundNumber: selectedRound,
        advancementType: settingsData.type,
        advancementValue: parseInt(settingsData.value),
        format: settingsData.format,
        cutoff: parseCutoff(settingsData.cutoff),
      });
      setShowSettings(false);
      setRefreshCompetitions((prev) => prev + 1);
      setRefreshResults((prev) => prev + 1);
    } catch (err) {
      alert("Error al guardar");
    }
  };

  /** Abre el modal de configuración con los valores actuales de la ronda */
  const handleOpenSettings = () => {
    if (currentRoundObj) {
      setSettingsData({
        type: currentRoundObj.advancementType,
        value: currentRoundObj.advancementValue,
        format: currentRoundObj.format || "a",
        cutoff: formatCutoff(currentRoundObj.cutoff || 0),
      });
      setShowSettings(true);
    }
  };

  /** Abre el modal de auditoría y carga los logs */
  const handleOpenLogs = async () => {
    setShowLogs(true);
    try {
      const res = await axios.get(`${API_URL}/api/audit/${id}`);
      setAuditLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  /** Alterna el estado de la ronda entre "In Progress" y "Finished" */
  const handleToggleRoundStatus = async (isFinished) => {
    const newStatus = isFinished ? "In Progress" : "Finished";
    if (!confirm(`¿Marcar como ${isFinished ? "EN CURSO" : "FINALIZADA"}?`))
      return;
    try {
      await axios.put(`${API_URL}/api/competitions/${id}/round-status`, {
        event: selectedEvent,
        roundNumber: selectedRound,
        status: newStatus,
      });
      setRefreshCompetitions((prev) => prev + 1);
    } catch (err) {
      alert("Error al cambiar estado");
    }
  };

  const handleToggleWithdrawal = async (
    competitorId,
    event,
    fromRound,
    withdrawn,
  ) => {
    try {
      await axios.patch(`${API_URL}/api/competitors/${competitorId}/withdraw`, {
        event,
        fromRound,
        withdrawn,
      });
      setRefreshResults((prev) => prev + 1);
      setRefreshCompetitors((prev) => prev + 1);
    } catch (err) {
      alert(err.response?.data?.message || "Error al actualizar la retirada.");
    }
  };

  // ── Datos filtrados y derivados, memoizados para evitar recálculos
  // en cada keystroke del formulario o update de WebSocket. ──

  const displayResults = useMemo(
    () =>
      selectedAgeGroup
        ? results.filter((r) => isInAgeGroup(r.competitor, selectedAgeGroup))
        : results,
    [results, selectedAgeGroup],
  );

  const displayCompetitors = useMemo(
    () =>
      selectedAgeGroup
        ? competitors.filter((c) => isInAgeGroup(c, selectedAgeGroup))
        : competitors,
    [competitors, selectedAgeGroup],
  );

  // Estadísticas de progreso
  const participantes = displayCompetitors.length; // Total de elegibles
  const participantesConResultado = displayResults.length; // Ya tienen tiempos
  const faltantes = participantes - participantesConResultado; // Faltan por registrar

  // Clasificados calculados sobre el tamaño del grupo mostrado
  const participantesQueClasifican = useMemo(() => {
    if (Number(currentRoundObj?.advancementValue) === 0) return 0;
    if (currentRoundObj?.advancementType === "ranking")
      return Math.min(currentRoundObj.advancementValue, participantes);
    if (currentRoundObj?.advancementType === "percent")
      return Math.floor(
        participantes * (currentRoundObj.advancementValue / 100),
      );
    return 0;
  }, [currentRoundObj, participantes]);

  // ============================================================
  // PANTALLA DE CARGA
  // ============================================================
  if (!competition || isVerifyingAuth)
    return <div className="text-white p-10 text-center">Cargando...</div>;

  // ============================================================
  // DATOS CALCULADOS PARA EL RENDERIZADO
  // ============================================================

  // Fecha formateada de la competición
  const displayDate = formatDateRange(
    competition.startDate,
    competition.endDate,
    competition.date,
  );

  // Rondas del evento actual, ordenadas por número
  const currentEventRounds = competition.rounds
    .filter((r) => r.event === selectedEvent)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  // Verifica si la ronda anterior está finalizada (necesario para desbloquear la actual)
  const prevRoundObj = competition?.rounds.find(
    (r) => r.event === selectedEvent && r.roundNumber === selectedRound - 1,
  );
  const isPrevRoundFinished =
    selectedRound === 1 || prevRoundObj?.status === "Finished";

  // Suprime los colores de clasificación cuando hay grupos de edad,
  // se muestra la vista global ("Todos") y la ronda aún no está cerrada.
  // Una vez cerrada, los colores son fiables porque advances está consolidado.
  const suppressAdvanceColors =
    competition.ageGroupsEnabled && !selectedAgeGroup && !isRoundFinished;

  // ============================================================
  // RENDERIZADO PRINCIPAL
  // ============================================================
  return (
    <div className="min-h-screen bg-almeria-dark text-almeria-light">
      {/* === MODALES === */}
      <LoginModal
        show={showLogin}
        onClose={() => setShowLogin(false)}
        loginData={loginData}
        setLoginData={setLoginData}
        onSubmit={handleLoginSubmit}
      />
      <AuditModal
        show={showLogs}
        onClose={() => setShowLogs(false)}
        auditLogs={auditLogs}
        formatTime={formatTime}
        formatWCATimesArray={formatWCATimesArray}
      />
      <RoundSettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        settingsData={settingsData}
        setSettingsData={setSettingsData}
        onSubmit={handleSaveRoundSettings}
        selectedRound={selectedRound}
        selectedEvent={selectedEvent}
      />
      <CompetitorEditorModal
        show={showCompetitorEditor}
        onClose={() => setShowCompetitorEditor(false)}
        competitionId={id}
        competitionEvents={competition.events}
        onSaved={() => {
          setRefreshCompetitors((prev) => prev + 1);
          setRefreshResults((prev) => prev + 1);
        }}
      />

      {/* === CABECERA === */}
      <div className="bg-gray-900 border-b-4 border-almeria-orange p-4 md:p-8 shadow-md relative">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-4">
          {/* Info de la competición (izquierda) */}
          <div className="flex-1 min-w-0">
            {/* Enlace de vuelta al calendario (oculto en modo proyector) */}
            {!isProjector && (
              <Link
                to="/"
                className="text-sm text-gray-400 hover:text-almeria-orange transition"
              >
                ← Volver al calendario
              </Link>
            )}
            <h1 className="text-2xl md:text-4xl font-bold text-white mt-2 tracking-wide uppercase break-words">
              {competition.name}
            </h1>
            {/* Ubicación y fecha */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span className="text-almeria-orange text-sm md:text-base">
                📍 {competition.location}
              </span>
              <span className="text-almeria-orange text-sm md:text-base">
                |
              </span>
              <span className="text-almeria-orange text-sm md:text-base">
                📅 {displayDate}
              </span>
            </div>
            {/* Badges de opciones activas */}
            {(competition.sorEnabled || competition.ageGroupsEnabled) && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {competition.sorEnabled && (
                  <span className="text-xs font-bold bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-md whitespace-nowrap">
                    🏅 SOR
                    {competition.scoringSystem === "f1"
                      ? " · Estilo F1"
                      : " · Clásico"}
                  </span>
                )}
                {competition.ageGroupsEnabled && (
                  <span className="text-xs font-bold bg-purple-900 text-purple-300 border border-purple-700 px-2 py-0.5 rounded-md whitespace-nowrap">
                    👶 Separación por edad
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Controles de cabecera (derecha) */}
          <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end w-full md:w-auto">
            {/* Botón vaciar papelera (solo SuperAdmin) */}
            {user?.role === "SuperAdmin" && (
              <button
                onClick={handleEmptyTrash}
                className="bg-red-900 text-red-100 px-3 py-1.5 rounded border border-red-700 hover:bg-red-700 transition font-bold shadow-md text-xs md:text-sm"
              >
                🗑️ <span className="hidden sm:inline">Vaciar Papelera</span>
              </button>
            )}

            {user?.role === "SuperAdmin" && (
              <button
                onClick={() => setShowCompetitorEditor(true)}
                className="bg-purple-800 text-purple-100 px-3 py-1.5 rounded border border-purple-700 hover:bg-purple-700 transition font-bold shadow-md text-xs md:text-sm"
              >
                ✏️ <span className="hidden sm:inline">Editar Competidores</span>
              </button>
            )}

            {/* Botón de logs de auditoría */}
            {isWritableAdmin && (
              <button
                onClick={handleOpenLogs}
                className="bg-white text-gray-900 px-3 py-1.5 rounded font-bold shadow-md hover:bg-gray-200 text-xs md:text-sm"
              >
                📜 <span className="hidden sm:inline">Logs</span>
              </button>
            )}

            {/* Enlace al proyector (abre en nueva pestaña) */}
            {user && (
              <Link
                to={`/projector/${id}/${selectedEvent}/${selectedRound}`}
                target="_blank"
                className="bg-blue-600 text-white px-3 py-1.5 rounded border border-blue-700 hover:bg-blue-500 transition font-bold shadow-md text-xs md:text-sm"
              >
                📺 <span className="hidden sm:inline">Proyector</span>
              </Link>
            )}

            {/* Botón login/logout */}
            {user ? (
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-3 py-1.5 rounded border border-red-600 hover:bg-red-600 transition font-bold shadow-md text-xs md:text-sm"
              >
                {isProjector ? (
                  "🔓 Salir"
                ) : (
                  <>
                    🔓{" "}
                    <span className="hidden sm:inline">
                      Cerrar Sesión ({user.username})
                    </span>
                    <span className="sm:hidden">Salir</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-gray-800 text-gray-300 px-3 py-1.5 rounded border border-gray-600 hover:text-white transition text-xs md:text-sm"
              >
                🔒 <span className="hidden sm:inline">Acceso Organización</span>
                <span className="sm:hidden">Acceder</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* === CONTENIDO PRINCIPAL === */}
      <div className="max-w-6xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* --- COLUMNA IZQUIERDA: Solo visible para admins --- */}
        {isWritableAdmin && (
          <div className="space-y-6 lg:col-span-1">
            {/* Formulario de nuevo competidor */}
            <div className="bg-white text-gray-800 p-6 rounded shadow border-l-4 border-almeria-orange">
              <h2 className="font-bold mb-2">1. Nuevo Competidor</h2>
              <form onSubmit={handleAddCompetitor} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    className="border p-2 rounded w-full"
                    value={newCompetitor.name}
                    onChange={(e) =>
                      setNewCompetitor({
                        ...newCompetitor,
                        name: e.target.value,
                      })
                    }
                    required
                    disabled={isAddingComp}
                  />
                  <input
                    type="text"
                    placeholder="WCA ID"
                    className="border p-2 rounded w-32 uppercase font-mono"
                    value={newCompetitor.wcaId}
                    onChange={(e) =>
                      setNewCompetitor({
                        ...newCompetitor,
                        wcaId: e.target.value,
                      })
                    }
                    disabled={isAddingComp}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Edad"
                      className={`border p-2 rounded w-24 ${
                        competition.ageGroupsEnabled && !newCompetitor.age
                          ? "border-orange-400 bg-orange-50"
                          : ""
                      }`}
                      value={newCompetitor.age}
                      onChange={(e) =>
                        setNewCompetitor({
                          ...newCompetitor,
                          age: e.target.value,
                        })
                      }
                      disabled={isAddingComp}
                    />
                    <input
                      type="text"
                      placeholder="Localidad / Ciudad"
                      className="border p-2 rounded w-full"
                      value={newCompetitor.locality}
                      onChange={(e) =>
                        setNewCompetitor({
                          ...newCompetitor,
                          locality: e.target.value,
                        })
                      }
                      disabled={isAddingComp}
                    />
                  </div>
                  {competition.ageGroupsEnabled && !newCompetitor.age && (
                    <p className="text-xs text-orange-500 font-bold">
                      ⚠️ Esta competición separa por grupos de edad. La edad es
                      obligatoria para clasificar correctamente.
                    </p>
                  )}
                </div>

                {/* Selector de eventos para la inscripción */}
                <div className="bg-gray-100 p-2 rounded border border-gray-300">
                  <p className="text-xs font-bold text-gray-600 mb-1">
                    Inscribir en:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {competition.events.map((ev) => (
                      <label
                        key={ev}
                        className="text-xs flex items-center gap-1 text-black cursor-pointer bg-white px-1.5 py-0.5 rounded shadow-sm border"
                      >
                        <input
                          type="checkbox"
                          checked={newCompetitor.events.includes(ev)}
                          onChange={(e) => {
                            const evs = e.target.checked
                              ? [...newCompetitor.events, ev]
                              : newCompetitor.events.filter((x) => x !== ev);
                            setNewCompetitor({ ...newCompetitor, events: evs });
                          }}
                        />{" "}
                        {ev}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  disabled={isAddingComp}
                  className={`w-full py-2 rounded font-bold transition ${isAddingComp ? "bg-gray-400 cursor-not-allowed" : "bg-almeria-dark text-white hover:bg-almeria-orange"}`}
                >
                  {isAddingComp ? "Añadiendo..." : "Inscribir Competidor"}
                </button>
              </form>
            </div>

            {/* Formulario de tiempos o bloqueo por ronda anterior */}
            {!isPrevRoundFinished ? (
              // Mensaje de bloqueo: la ronda anterior debe cerrarse primero
              <div className="bg-blue-900 border-l-4 border-blue-400 text-blue-200 p-6 rounded shadow text-center text-sm">
                <p className="text-3xl mb-2">🛑</p>
                <p className="font-bold">Ronda Anterior Abierta</p>
                <p className="mt-2">
                  No puedes meter tiempos en la Ronda {selectedRound} hasta que
                  cierres (bloquees) la Ronda {selectedRound - 1}.
                </p>
              </div>
            ) : (
              <>
                {/* Formulario de entrada de tiempos */}
                <TimeEntryForm
                  competitors={competitors}
                  searchName={searchName}
                  setSearchName={setSearchName}
                  showDropdown={showDropdown}
                  setShowDropdown={setShowDropdown}
                  selectedCompetitorId={selectedCompetitorId}
                  setSelectedCompetitorId={setSelectedCompetitorId}
                  handleSelectCompetitor={handleSelectCompetitor}
                  handleDeleteCompetitor={handleDeleteCompetitor}
                  inputTimes={inputTimes}
                  setInputTimes={setInputTimes}
                  handleTimeKeyDown={handleTimeKeyDown}
                  handleSubmitTimes={handleSubmitTimes}
                  inputRefs={inputRefs}
                  searchInputRef={searchInputRef}
                  submitBtnRef={submitBtnRef}
                  isSavingTimes={isSavingTimes}
                  attemptsCount={attemptsCount}
                  roundCutoff={roundCutoff}
                  limitIndex={getCutoffLimitIndex()}
                  cutoffPassed={hasPassedCutoff()}
                />
                {/* Resumen de clasificados por grupo (ronda > 1 con grupos de edad) */}
                {competition.ageGroupsEnabled &&
                  selectedRound > 1 &&
                  isPrevRoundFinished && (
                    <div className="bg-gray-800 border border-gray-700 rounded p-3 text-xs text-gray-400">
                      <p className="font-bold text-gray-300 mb-1">
                        Elegibles esta ronda por grupo:
                      </p>
                      {Object.entries(AGE_GROUPS_CLIENT).map(([key, group]) => {
                        const count = competitors.filter((c) =>
                          isInAgeGroup(c, key),
                        ).length;
                        return (
                          <div key={key} className="flex justify-between">
                            <span>{group.label}</span>
                            <span className="font-bold text-white">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between border-t border-gray-700 mt-1 pt-1">
                        <span className="font-bold text-gray-300">Total</span>
                        <span className="font-bold text-white">
                          {competitors.length}
                        </span>
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        )}

        {/* --- COLUMNA DERECHA: Resultados (visible para todos) --- */}
        <div className={isWritableAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
          {/* Pestañas de eventos */}
          <div className="flex gap-2 mb-2 border-b border-gray-700 pb-2 overflow-x-auto">
            {/* Pestañas de grupos de edad (solo si está habilitado y no estamos en SOR) */}
            {competition.ageGroupsEnabled && selectedEvent !== "__SOR__" && (
              <div className="flex gap-2 mb-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedAgeGroup(null)}
                  className={`px-4 py-1 text-xs font-bold rounded-full transition ${
                    !selectedAgeGroup
                      ? "bg-almeria-orange text-white"
                      : "bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
                  }`}
                >
                  Todos
                </button>
                {Object.entries(AGE_GROUPS_CLIENT).map(([key, group]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedAgeGroup(key)}
                    className={`px-4 py-1 text-xs font-bold rounded-full transition ${
                      selectedAgeGroup === key
                        ? "bg-almeria-orange text-white"
                        : "bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            )}

            {competition.events.map((ev) => (
              <button
                key={ev}
                type="button"
                onClick={() => {
                  setSelectedEvent(ev);
                  setSelectedRound(1); // Vuelve a la ronda 1 al cambiar de evento
                }}
                className={`px-6 py-2 font-bold rounded-t-lg transition ${selectedEvent === ev ? "bg-almeria-orange text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"}`}
              >
                Evento {ev}
              </button>
            ))}

            {/* Pestaña SOR (solo si la competición tiene SOR activo) */}
            {competition.sorEnabled && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEvent("__SOR__");
                }}
                className={`px-6 py-2 font-bold rounded-t-lg transition ${
                  selectedEvent === "__SOR__"
                    ? "bg-almeria-orange text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                }`}
              >
                🏅 SOR
              </button>
            )}
          </div>

          {/* Barra de rondas y controles */}
          {selectedEvent === "__SOR__" ? (
            /* ── VISTA SOR ── */
            <div>
              <div className="flex justify-between items-center mb-4 bg-gray-800 p-2 rounded-lg">
                <h3 className="text-white font-bold px-2">
                  🏅 Clasificación SOR
                </h3>
                {competition.series && (
                  <a
                    href={`/series/${encodeURIComponent(competition.series)}/sor`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm bg-almeria-orange text-white px-3 py-1 rounded hover:bg-orange-600 transition font-bold"
                  >
                    🏆 SOR de la Serie
                  </a>
                )}
              </div>
              <SORTable
                compId={id}
                ageGroupsEnabled={competition.ageGroupsEnabled}
              />
            </div>
          ) : (
            /* ── VISTA NORMAL DE RONDAS ── */
            <>
              <div className="flex justify-between items-center mb-4 bg-gray-800 p-2 rounded-b-lg overflow-x-auto">
                <div className="flex gap-2 items-center">
                  {/* Botones de ronda */}
                  {currentEventRounds.map((r) => (
                    <button
                      key={r.roundNumber}
                      onClick={() => setSelectedRound(r.roundNumber)}
                      className={`px-4 py-1 text-sm font-bold rounded transition ${selectedRound === r.roundNumber ? "bg-gray-600 text-white shadow-inner" : "text-gray-400 hover:text-white"}`}
                    >
                      Ronda {r.roundNumber}
                    </button>
                  ))}

                  {/* Controles de configuración y estado de ronda (solo admin) */}
                  {isWritableAdmin && (
                    <>
                      {/* Botón de configuración */}
                      <button
                        onClick={handleOpenSettings}
                        title="Configurar avance"
                        className="text-gray-400 hover:text-white ml-2 text-lg"
                      >
                        ⚙️
                      </button>

                      {/* Botón de cerrar/reabrir ronda */}
                      <button
                        onClick={() => handleToggleRoundStatus(isRoundFinished)}
                        className={`text-xs px-2 py-1 ml-4 rounded font-bold transition ${isRoundFinished ? "bg-gray-600 text-white hover:bg-gray-500" : "bg-blue-500 text-white hover:bg-blue-400 shadow-lg"}`}
                      >
                        {isRoundFinished ? "🔒 Cerrada" : "🔓 Cerrar Ronda"}
                      </button>
                    </>
                  )}
                </div>

                {/* Botón para abrir la siguiente ronda */}
                {isWritableAdmin && (
                  <button
                    onClick={handleCreateNextRound}
                    className="text-sm bg-wca-green text-white px-3 py-1 rounded hover:bg-green-600 transition font-bold whitespace-nowrap ml-4"
                  >
                    + Abrir Ronda {currentEventRounds.length + 1}
                  </button>
                )}
              </div>

              {/* Tabla de resultados */}
              <ResultsTable
                results={displayResults}
                attemptsCount={attemptsCount}
                roundFormat={roundFormat}
                isRoundFinished={isRoundFinished}
                isFinalRound={parseInt(currentRoundObj?.advancementValue) === 0}
                faltantes={faltantes}
                participantesQueClasifican={participantesQueClasifican}
                selectedRound={selectedRound}
                selectedEvent={selectedEvent}
                formatTime={formatTime}
                formatWCATimesArray={formatWCATimesArray}
                suppressAdvanceColors={suppressAdvanceColors}
                isWritableAdmin={isWritableAdmin}
                onToggleWithdrawal={handleToggleWithdrawal}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompetitionDetails;
