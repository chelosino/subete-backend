import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import authRoutes from './auth';
import bodyParser from "body-parser";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authRoutes); // 🛡 rutas de auth

app.get("/", (req, res) => {
  res.send("✅ Backend Shopify activo");
});

app.post("/api/create-campaign", async (req, res) => {
  const { nombre, meta } = req.body;

  if (!nombre || !meta) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    const { error } = await supabase.from("campaigns").insert({
      nombre,
      meta,
      // podrías guardar `shop` si lo tenés en la sesión o en una cookie
    });

    if (error) {
      console.error("❌ Error al insertar campaña:", error);
      return res.status(500).json({ error: "Error al crear campaña" });
    }

    return res.status(200).json({ message: "Campaña creada" });
  } catch (err) {
    console.error("❌ Error inesperado:", err);
    return res.status(500).json({ error: "Error del servidor" });
  }
});

app.listen(port, () => {
  console.log(`🟢 Backend corriendo en http://localhost:${port}`);
});
