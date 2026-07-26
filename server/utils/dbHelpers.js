const Competition = require("../models/Competition");
const Competitor = require("../models/Competitor");

const getCompetitionOrFail = async (id, res) => {
  const comp = await Competition.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!comp) {
    res.status(404).json({ message: "Competición no encontrada." });
    return null;
  }
  return comp;
};

const getCompetitorOrFail = async (id, competitionId, res) => {
  const filter = { _id: id, isDeleted: { $ne: true } };
  if (competitionId) filter.competition = competitionId;
  const competitor = await Competitor.findOne(filter);
  if (!competitor) {
    res.status(404).json({ message: "Competidor no encontrado." });
    return null;
  }
  return competitor;
};

module.exports = { getCompetitionOrFail, getCompetitorOrFail };
