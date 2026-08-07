const mongoose = require("mongoose");
const logger = require("../utils/logger");

const buildConnectionOptions = () => {
  const opts = {};
  if (process.env.MONGO_TLS_CA_FILE) {
    opts.tls = true;
    opts.tlsCAFile = process.env.MONGO_TLS_CA_FILE;
  }
  if (process.env.MONGO_AUTH_SOURCE)
    opts.authSource = process.env.MONGO_AUTH_SOURCE;
  if (process.env.MONGO_REPLICA_SET)
    opts.replicaSet = process.env.MONGO_REPLICA_SET;
  return opts;
};

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("❌ FATAL: MONGO_URI no definido en .env.");
    process.exit(1);
  }

  mongoose.connection.on("error", (err) =>
    logger.error({ err }, "Error de conexión a MongoDB"),
  );
  mongoose.connection.on("disconnected", () =>
    logger.warn("MongoDB desconectado"),
  );

  await mongoose.connect(process.env.MONGO_URI, buildConnectionOptions());
  const target = process.env.MONGO_URI.includes("mongodb+srv")
    ? "Atlas"
    : "on-premise / self-hosted";
  logger.info({ target }, "Conectado a MongoDB");
};

module.exports = { connectDB };
