const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const Registration = require("../models/Registration");
const { daysElapsedSince } = require("../utils/dateHelpers");
const { parsePositiveInt } = require("../utils/parseEnvInt");
const { sendServerError } = require("../utils/errorResponse");

const EDIT_WINDOW_DAYS = parsePositiveInt(
  process.env.DELEGATE_EDIT_WINDOW_DAYS,
  2,
);

/**
 * true si el usuario puede editar la competición: SuperAdmin siempre,
 * o si no han pasado más de EDIT_WINDOW_DAYS desde su endDate.
 */
const isEditWindowOpen = (comp, userRole) => {
  if (userRole === "SuperAdmin") return true;
  return daysElapsedSince(comp.endDate) <= EDIT_WINDOW_DAYS;
};

const editWindowGuard = (resolveCompetition) => async (req, res, next) => {
  if (req.user?.role === "SuperAdmin") return next();
  try {
    const comp = await resolveCompetition(req);
    if (!comp) return next(); // ID válido per recurso inexistente: la ruta gestiona el 404
    if (!isEditWindowOpen(comp, req.user?.role)) {
      return res.status(403).json({
        message: `Esta competición finalizó hace más de ${EDIT_WINDOW_DAYS} día(s). Solo un SuperAdmin puede modificarla ya.`,
      });
    }
    next();
  } catch {
    // ID ya validado por validateObjectId: un fallo aquí es un error real
    // (DB, etc.), no un ID malformado. Falla cerrado, no en abierto.
    sendServerError(res, err);
  }
};

const byParamId =
  (paramName = "id") =>
  (req) =>
    Competition.findById(req.params[paramName]);
const byBodyCompetitionId = (req) =>
  Competition.findById(req.body.competitionId);
const byCompetitorId =
  (paramName = "id") =>
  async (req) => {
    const c = await Competitor.findById(req.params[paramName]);
    return c ? Competition.findById(c.competition) : null;
  };
const byRegistrationId =
  (paramName = "id") =>
  async (req) => {
    const r = await Registration.findById(req.params[paramName]);
    return r ? Competition.findById(r.competition) : null;
  };

module.exports = {
  isEditWindowOpen,
  editWindowGuard,
  byParamId,
  byBodyCompetitionId,
  byCompetitorId,
  byRegistrationId,
};
