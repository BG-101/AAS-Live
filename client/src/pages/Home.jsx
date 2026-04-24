// ============================================================
// PÁGINA: Home
// Página principal de la aplicación. Muestra:
// - Lista de competiciones (pública, para todos)
// - Formulario de creación de competiciones (solo SuperAdmin)
// - Panel de bienvenida (para Delegados y visitantes)
// - Controles de autenticación (login/logout/registro)
// ============================================================

import { useEffect, useState } from "react";
import axios from "axios";
import { parseCutoff } from "../utils/formatters";

import LoginModal from "../components/LoginModal";
import RegisterModal from "../components/RegisterModal";
import CompetitionList from "../components/CompetitionList";
import { API_URL } from "../utils/api";

// Lista de todos los eventos WCA soportados por el sistema
const WCA_EVENTS = [
  "3x3",
  "2x2",
  "4x4",
  "5x5",
  "6x6",
  "7x7",
  "OH",
  "3x3 BLD",
  "4x4 BLD",
  "5x5 BLD",
  "FMC",
  "Pyraminx",
  "Skewb",
  "Megaminx",
  "Sq-1",
  "Clock",
];

function Home() {
  // --- Estado de autenticación ---
  const [user, setUser] = useState(null); // { role, username } o null
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [showRegister, setShowRegister] = useState(false);
  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    role: "Delegado",
  });

  // --- Estado de competiciones ---
  const [competitions, setCompetitions] = useState([]);
  const [formData, setFormData] = useState({
    wcaId: "",
    name: "",
    series: "",
    location: "",
    startDate: "",
    endDate: "",
    competitorLimit: 50,
    sorEnabled: false,
    ageGroupsEnabled: false,
    scoringSystem: "sor",
  });

  // Configuración de eventos seleccionados y sus rondas.
  // Estructura: { "3x3": [{ type, value, format, cutoff }, ...], "2x2": [...] }
  const [eventConfigs, setEventConfigs] = useState({});

  // Contador que se incrementa para forzar la recarga de competiciones
  const [refreshCompetitions, setRefreshCompetitions] = useState(0);

  // ============================================================
  // EFECTO: Verificación de autenticación al cargar la página
  // Consulta al servidor si hay una sesión activa (cookie JWT válida)
  // ============================================================
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/auth/me`);
        setUser({ role: res.data.role, username: res.data.username });
      } catch {
        setUser(null); // No hay sesión activa
      } finally {
        setIsVerifyingAuth(false);
        // Limpieza de localStorage legacy (eliminar tras un ciclo de versiones)
        localStorage.removeItem("userRole");
        localStorage.removeItem("userName");
      }
    };
    verifyAuth();

    // Escucha el evento global de expiración de auth (emitido por el interceptor de Axios)
    const handleAuthExpired = () => {
      setUser(null);
      setIsVerifyingAuth(false);
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);

  // ============================================================
  // EFECTO: Carga de competiciones
  // Se re-ejecuta cada vez que refreshCompetitions cambia
  // ============================================================
  useEffect(() => {
    axios
      .get(`${API_URL}/api/competitions`)
      .then((res) => setCompetitions(res.data))
      .catch((err) => console.error(err));
  }, [refreshCompetitions]);

  // ============================================================
  // HANDLERS DE AUTENTICACIÓN
  // ============================================================

  /** Envía login al servidor y guarda la sesión si es exitoso */
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

  /** Cierra la sesión del usuario y limpia localStorage */
  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`);
      setUser(null);
    } catch (err) {
      console.error(err);
    }
  };

  /** Crea una nueva cuenta de usuario (solo SuperAdmin) */
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(
        `${API_URL}/api/auth/register`,
        registerData,
      );
      alert(res.data.message);
      setShowRegister(false);
      setRegisterData({ username: "", password: "", role: "Delegado" });
    } catch (err) {
      alert(err.response?.data?.message || "Error al registrar");
    }
  };

  // ============================================================
  // HANDLERS DE CONFIGURACIÓN DE EVENTOS Y RONDAS
  // Estos handlers gestionan la selección de eventos y la
  // configuración de rondas en el formulario de nueva competición.
  // ============================================================

  /**
   * Activa/desactiva un evento en la competición.
   * Al activar, asigna un formato por defecto según el tipo de evento.
   */
  const toggleEvent = (ev) => {
    setEventConfigs((prev) => {
      const newConf = { ...prev };
      if (newConf[ev]) {
        // Si ya estaba activado, lo desactiva
        delete newConf[ev];
      } else {
        // Determina el formato por defecto según el evento
        let defFormat = "a"; // Ao5 por defecto
        if (["6x6", "7x7", "FMC"].includes(ev)) defFormat = "m"; // Mo3 para puzzles grandes y FMC
        if (["3x3 BLD", "4x4 BLD", "5x5 BLD"].includes(ev)) defFormat = "b"; // Bo3 para BLD

        // Activa el evento con 1 ronda por defecto (ronda final, value=0)
        newConf[ev] = [
          { type: "ranking", value: 0, format: defFormat, cutoff: "" },
        ];
      }
      return newConf;
    });
  };

  /** Añade una ronda adicional al evento. La última ronda existente pasa a ser clasificatoria. */
  const addRound = (ev) => {
    setEventConfigs((prev) => {
      const newConf = { ...prev };
      const rounds = [...newConf[ev]];

      // Si la última ronda era la "final" (value=0), la convierte en clasificatoria
      if (rounds.length > 0 && rounds[rounds.length - 1].value === 0) {
        rounds[rounds.length - 1] = {
          ...rounds[rounds.length - 1],
          type: "percent",
          value: 75, // 75% avanza por defecto
        };
      }

      // Añade la nueva ronda como "final" (value=0, sin avance)
      let defFormat = rounds.length > 0 ? rounds[0].format : "a";
      rounds.push({ type: "ranking", value: 0, format: defFormat, cutoff: "" });
      newConf[ev] = rounds;
      return newConf;
    });
  };

  /** Elimina la última ronda del evento. La nueva última pasa a ser "final". */
  const removeRound = (ev) => {
    setEventConfigs((prev) => {
      const newConf = { ...prev };
      const rounds = [...newConf[ev]];
      if (rounds.length > 1) {
        rounds.pop(); // Elimina la última
        rounds[rounds.length - 1].value = 0; // La nueva última es la final
      }
      newConf[ev] = rounds;
      return newConf;
    });
  };

  /** Actualiza un campo específico de una ronda (formato, cutoff, tipo, valor) */
  const updateRoundConfig = (ev, roundIndex, field, val) => {
    setEventConfigs((prev) => {
      const newConf = { ...prev };
      newConf[ev][roundIndex][field] = val;
      return newConf;
    });
  };

  // ============================================================
  // HANDLER: Borrar competición
  // Pide confirmación escribiendo "BORRAR" para evitar borrados accidentales
  // ============================================================
  const handleDeleteComp = async (id, name) => {
    if (
      prompt(
        `¡PELIGRO! Vas a borrar TODO el torneo "${name}". Escribe "BORRAR":`,
      ) === "BORRAR"
    ) {
      try {
        await axios.delete(`${API_URL}/api/competitions/${id}`);
        setRefreshCompetitions((prev) => prev + 1);
      } catch (err) {
        alert(err.response?.data?.message || "Error eliminando");
      }
    }
  };

  // ============================================================
  // HANDLER: Crear nueva competición
  // Construye el payload de rondas y lo envía al servidor
  // ============================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    const selectedEventsKeys = Object.keys(eventConfigs);
    if (selectedEventsKeys.length === 0)
      return alert("Debes seleccionar al menos 1 evento.");

    // Construye el array de rondas a partir de la configuración de cada evento
    const roundsPayload = [];
    selectedEventsKeys.forEach((ev) => {
      eventConfigs[ev].forEach((config, idx) => {
        roundsPayload.push({
          event: ev,
          roundNumber: idx + 1,
          status: "In Progress",
          advancementType: config.type,
          advancementValue: parseInt(config.value) || 0,
          format: config.format,
          cutoff: parseCutoff(config.cutoff), // Convierte el input a centésimas
        });
      });
    });

    try {
      await axios.post(`${API_URL}/api/competitions`, {
        ...formData,
        events: selectedEventsKeys,
        rounds: roundsPayload,
        // sorEnabled y ageGroupsEnabled ya vienen dentro de formData con el spread
      });

      // Limpia el formulario y recarga las competiciones
      setRefreshCompetitions((prev) => prev + 1);
      setFormData({
        wcaId: "",
        name: "",
        series: "",
        location: "",
        startDate: "",
        endDate: "",
        competitorLimit: 50,
      });
      setEventConfigs({});
    } catch (error) {
      alert("Error: " + error.response?.data?.message);
    }
  };

  // ============================================================
  // RENDERIZADO
  // ============================================================
  return (
    <div className="min-h-screen p-8 bg-almeria-dark text-almeria-light relative">
      {isVerifyingAuth ? (
        <div className="min-h-screen bg-almeria-dark flex items-center justify-center">
          <p className="text-gray-400 text-lg">Cargando...</p>
        </div>
      ) : (
        <>
          {/* Modales de login y registro (se muestran/ocultan con estado) */}
          <LoginModal
            show={showLogin}
            onClose={() => setShowLogin(false)}
            loginData={loginData}
            setLoginData={setLoginData}
            onSubmit={handleLoginSubmit}
          />

          <RegisterModal
            show={showRegister}
            onClose={() => setShowRegister(false)}
            registerData={registerData}
            setRegisterData={setRegisterData}
            onSubmit={handleRegisterSubmit}
          />

          {/* Controles de autenticación (esquina superior derecha) */}
          <div className="absolute top-4 right-4 md:top-8 md:right-8 flex gap-2 flex-wrap justify-end max-w-xs md:max-w-none">
            {/* Botón de nuevo usuario (solo SuperAdmin) */}
            {user?.role === "SuperAdmin" && (
              <button
                onClick={() => setShowRegister(true)}
                className="bg-blue-600 text-white px-3 py-1.5 rounded border border-blue-700 hover:bg-blue-500 transition font-bold shadow-md text-xs md:text-sm"
              >
                + <span className="hidden sm:inline">Nuevo Usuario</span>
              </button>
            )}

            {/* Botón de logout (si autenticado) o login (si no) */}
            {user ? (
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-3 py-1.5 rounded border border-red-600 hover:bg-red-600 transition font-bold shadow-md text-xs md:text-sm"
              >
                🔓{" "}
                <span className="hidden sm:inline">
                  Cerrar Sesión ({user.username})
                </span>
                <span className="sm:hidden">Salir</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-gray-800 text-gray-300 px-3 py-1.5 rounded border border-gray-600 hover:bg-almeria-orange hover:text-white transition text-xs md:text-sm"
              >
                🔒 <span className="hidden sm:inline">Acceso Organización</span>
                <span className="sm:hidden">Acceder</span>
              </button>
            )}
          </div>

          {/* Título principal */}
          <h1 className="text-4xl font-bold text-almeria-orange mb-8 text-center uppercase mt-4">
            AAS Live
          </h1>

          {/* Layout: formulario/bienvenida (izquierda) + lista de competiciones (derecha) */}
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            {/* --- Columna izquierda: Formulario o Panel de bienvenida --- */}
            {user?.role === "SuperAdmin" ? (
              // ============== FORMULARIO DE NUEVA COMPETICIÓN ==============
              <div className="bg-white text-gray-800 p-6 rounded-lg shadow-lg border-l-4 border-almeria-orange h-fit max-h-[85vh] flex flex-col">
                <h2 className="text-2xl font-bold mb-4 shrink-0">
                  Nueva Competición
                </h2>
                <form
                  onSubmit={handleSubmit}
                  className="space-y-4 overflow-y-auto pr-2 flex-1"
                >
                  {/* Campo: ID WCA */}
                  <input
                    type="text"
                    placeholder="ID WCA"
                    className="w-full p-2 border rounded"
                    value={formData.wcaId}
                    onChange={(e) =>
                      setFormData({ ...formData, wcaId: e.target.value })
                    }
                    required
                  />

                  {/* Campo: Nombre oficial */}
                  <input
                    type="text"
                    placeholder="Nombre Oficial"
                    className="w-full p-2 border rounded"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />

                  {/* Campo: Serie/Liga (opcional) */}
                  <input
                    type="text"
                    placeholder="Serie / Liga (Opcional)"
                    className="w-full p-2 border rounded bg-gray-50 focus:bg-white"
                    value={formData.series}
                    onChange={(e) =>
                      setFormData({ ...formData, series: e.target.value })
                    }
                  />

                  {/* Campo: Lugar */}
                  <input
                    type="text"
                    placeholder="Lugar"
                    className="w-full p-2 border rounded"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    required
                  />

                  {/* Campos: Fecha inicio y fin */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-500 mb-1">
                        Fecha Inicio
                      </label>
                      <input
                        type="date"
                        className="w-full p-2 border border-gray-300 rounded outline-none focus:border-almeria-orange"
                        value={formData.startDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            startDate: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-500 mb-1">
                        Fecha Fin
                      </label>
                      <input
                        type="date"
                        className="w-full p-2 border border-gray-300 rounded outline-none focus:border-almeria-orange"
                        value={formData.endDate}
                        onChange={(e) =>
                          setFormData({ ...formData, endDate: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  {/* Campo: Límite de competidores */}
                  <input
                    type="number"
                    placeholder="Límite Comp."
                    className="w-full p-2 border rounded"
                    value={formData.competitorLimit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        competitorLimit: e.target.value,
                      })
                    }
                    required
                  />

                  {/* Selector de eventos/categorías */}
                  <div>
                    <p className="font-bold text-sm mb-2 text-gray-600">
                      Categorías:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {WCA_EVENTS.map((ev) => (
                        <button
                          key={ev}
                          type="button"
                          onClick={() => toggleEvent(ev)}
                          className={`px-2 py-1 text-xs font-bold rounded border transition shadow-sm ${Object.keys(eventConfigs).includes(ev) ? "bg-almeria-orange text-white border-almeria-orange" : "bg-gray-100 text-gray-500 border-gray-300"}`}
                        >
                          {ev}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opciones especiales: SOR y grupos de edad */}
                  <div className="bg-blue-50 p-3 rounded border border-blue-200 flex flex-col gap-2">
                    <p className="text-xs font-bold text-gray-600 mb-1">
                      Opciones de Competición:
                    </p>

                    {/* SOR independiente */}
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.sorEnabled}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sorEnabled: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>Activar SOR</strong> (Sum of Ranks - competición
                        por puntos)
                      </span>
                    </label>

                    {/* Sistema de puntuación: visible solo si SOR activo */}
                    {formData.sorEnabled && (
                      <div className="ml-4 flex flex-col gap-1">
                        <p className="text-xs font-bold text-gray-500">
                          Sistema de puntuación:
                        </p>
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700">
                          <input
                            type="radio"
                            name="scoringSystem"
                            value="sor"
                            checked={formData.scoringSystem === "sor"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                scoringSystem: e.target.value,
                              })
                            }
                          />
                          <span>SOR Clásico (menor puntuación = mejor)</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700">
                          <input
                            type="radio"
                            name="scoringSystem"
                            value="f1"
                            checked={formData.scoringSystem === "f1"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                scoringSystem: e.target.value,
                              })
                            }
                          />
                          <span>
                            Estilo F1 (25-18-15-12-10-8-6-4-2-1, mayor
                            puntuación = mejor)
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Grupos de edad: independiente del SOR */}
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.ageGroupsEnabled}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            ageGroupsEnabled: e.target.checked,
                          })
                        }
                      />
                      <span>
                        Separar por <strong>grupos de edad</strong> (Alevín /
                        Infantil / Absoluta)
                      </span>
                    </label>
                  </div>

                  {/* Configuración de rondas para cada evento seleccionado */}
                  {Object.keys(eventConfigs).length > 0 && (
                    <div className="mt-4 border-t-2 border-dashed border-gray-200 pt-4">
                      {Object.keys(eventConfigs).map((ev) => (
                        <div
                          key={ev}
                          className="bg-gray-50 p-3 rounded border border-gray-200 mb-3 shadow-inner"
                        >
                          {/* Cabecera del evento con botones +/- rondas */}
                          <div className="flex justify-between items-center mb-2 border-b pb-2">
                            <span className="font-bold text-almeria-orange uppercase tracking-wider text-lg">
                              Evento {ev}
                            </span>
                            <div className="flex gap-2 items-center">
                              <button
                                type="button"
                                onClick={() => removeRound(ev)}
                                className="w-8 h-8 bg-gray-300 rounded-full font-bold hover:bg-red-500 hover:text-white"
                              >
                                -
                              </button>
                              <span className="font-bold w-16 text-center text-sm">
                                {eventConfigs[ev].length} Rondas
                              </span>
                              <button
                                type="button"
                                onClick={() => addRound(ev)}
                                className="w-8 h-8 bg-gray-300 rounded-full font-bold hover:bg-wca-green hover:text-white"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Configuración de cada ronda del evento */}
                          <div className="space-y-2 mt-3">
                            {eventConfigs[ev].map((round, idx) => {
                              // La última ronda se resalta en naranja (es la final)
                              const isFinal =
                                idx === eventConfigs[ev].length - 1;
                              return (
                                <div
                                  key={idx}
                                  className={`grid grid-cols-5 gap-1 items-center text-xs p-2 rounded ${isFinal ? "bg-orange-100 border border-orange-200" : "bg-white border border-gray-200"}`}
                                >
                                  {/* Número de ronda */}
                                  <span
                                    className={`col-span-1 font-bold ${isFinal ? "text-almeria-orange" : "text-gray-600"}`}
                                  >
                                    Ronda {idx + 1}
                                  </span>

                                  {/* Formato (Ao5/Mo3/Bo3) */}
                                  <select
                                    className="col-span-1 p-1 border rounded"
                                    value={round.format}
                                    onChange={(e) =>
                                      updateRoundConfig(
                                        ev,
                                        idx,
                                        "format",
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="a">Ao5</option>
                                    <option value="m">Mo3</option>
                                    <option value="b">Bo3</option>
                                  </select>

                                  {/* Cutoff */}
                                  <input
                                    type="text"
                                    placeholder="Cut (1000)"
                                    className="col-span-1 border rounded"
                                    value={round.cutoff}
                                    onChange={(e) =>
                                      updateRoundConfig(
                                        ev,
                                        idx,
                                        "cutoff",
                                        e.target.value,
                                      )
                                    }
                                  />

                                  {/* Tipo de avance (% o Top fijo) */}
                                  <select
                                    className="col-span-1 p-1 border rounded"
                                    value={round.type}
                                    onChange={(e) =>
                                      updateRoundConfig(
                                        ev,
                                        idx,
                                        "type",
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="percent">%</option>
                                    <option value="ranking">Top</option>
                                  </select>

                                  {/* Valor del avance (número de personas o porcentaje) */}
                                  <input
                                    type="number"
                                    min="0"
                                    className="col-span-1 p-1 border rounded text-center"
                                    value={round.value}
                                    onChange={(e) =>
                                      updateRoundConfig(
                                        ev,
                                        idx,
                                        "value",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botón de crear (sticky al fondo del scroll) */}
                  <div className="pt-2 sticky bottom-0 bg-white">
                    <button
                      type="submit"
                      className="w-full bg-almeria-orange text-white font-bold py-3 rounded hover:bg-orange-600 shadow-lg text-lg"
                    >
                      CREAR COMPETICIÓN
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              // ============== PANEL DE BIENVENIDA (NO SUPERADMIN) ==============
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 flex flex-col justify-center items-center text-center h-fit">
                <img
                  src="/logo.png"
                  alt="AAS Logo"
                  className="w-24 h-24 object-contain mb-4 drop-shadow-md"
                />
                <h2 className="text-xl font-bold text-almeria-orange mb-2">
                  Bienvenido a AAS Live
                </h2>
                <p className="text-gray-400">
                  {user?.role === "Delegado"
                    ? `¡Hola ${user.username}! Selecciona un torneo para gestionar tiempos.`
                    : "Selecciona un torneo a la derecha para ver los resultados en vivo."}
                </p>
              </div>
            )}

            {/* --- Columna derecha: Lista de competiciones --- */}
            <CompetitionList
              competitions={competitions}
              user={user}
              onDeleteComp={handleDeleteComp}
            />
          </div>
        </>
      )}
    </div>
  );
}
export default Home;
