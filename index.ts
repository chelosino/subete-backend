import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import authRoutes from './auth';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authRoutes); // 🛡 rutas de auth

app.get("/", (req, res) => {
  res.send("✅ Backend Shopify activo");
});

app.listen(port, () => {
  console.log(`🟢 Backend corriendo en http://localhost:${port}`);
});
