const mongoose = require("mongoose");

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
    console.error("❌ Error de conexión a MongoDB:", err),
  );
  mongoose.connection.on("disconnected", () =>
    console.warn("⚠️ MongoDB desconectado."),
  );

  await mongoose.connect(process.env.MONGO_URI, buildConnectionOptions());
  const target = process.env.MONGO_URI.includes("mongodb+srv")
    ? "Atlas"
    : "on-premise / self-hosted";
  console.log(`✅ Conectado a MongoDB (${target})`);
};

module.exports = { connectDB };
