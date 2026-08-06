const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");
const Registration = require("../models/Registration");
const { daysElapsedSince } = require("../utils/dateHelpers");
const { parsePositiveInt } = require("../utils/parseEnvInt");

const EDIT_WINDOW_DAYS = parsePositiveInt(
  process.env.DELEGATE_EDIT_WINDOW_DAYS,
  2,
);

const editWindowGuard = (resolveCompetition) => async (req, res, next) => {
  if (req.user?.role === "SuperAdmin") return next();
  try {
    const comp = await resolveCompetition(req);
    if (!comp) return next(); // Deja que la ruta gestione el 400/404
    if (daysElapsedSince(comp.endDate) > EDIT_WINDOW_DAYS) {
      return res.status(403).json({
        message: `Esta competición finalizó hace más de ${EDIT_WINDOW_DAYS} día(s). Solo un SuperAdmin puede modificarla ya.`,
      });
    }
    next();
  } catch {
    next(); // ID mal formado y otro fallo: que la ruta lo valide
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
  editWindowGuard,
  byParamId,
  byBodyCompetitionId,
  byCompetitorId,
  byRegistrationId,
};
