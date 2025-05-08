import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import authRoutes from './auth';
import cors from "cors";

const corsOptions = {
  origin: "https://subete-frontend.vercel.app", // ⚠️ ajusta según entorno
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

const app = express();
app.use(cors(corsOptions));
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authRoutes); // 🛡 rutas de auth

app.get("/", (req, res) => {
  res.send("✅ Backend Shopify activo");
});

app.listen(port, () => {
  console.log(`🟢 Backend corriendo en http://localhost:${port}`);
});
