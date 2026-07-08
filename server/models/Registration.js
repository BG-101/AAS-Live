const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Competition",
    required: true,
  },
  name: { type: String, required: true },
  wcaId: { type: String, default: "" },
  age: { type: Number, default: null },
  locality: { type: String, default: "" },
  email: { type: String, default: "" },
  events: [{ type: String }],
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  formResponseId: { type: String }, // Para deduplicar respuesta del form
  rawData: { type: Object, default: {} },
  notes: { type: String, default: "" },
  approvedAt: { type: Date },
  approvedBy: { type: String, default: "" },
  rejectedAt: { type: Date },
  rejectedBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

registrationSchema.index({ competition: 1, status: 1 });
// sparse: true -> null no cuenta para la unicidad (inscripciones manuales coexisten)
registrationSchema.index(
  { competition: 1, formResponseId: 1 },
  { unique: true, sparse: true },
);

module.exports = mongoose.model("Registration", registrationSchema);
