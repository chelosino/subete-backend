import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SCOPES,
  APP_URL,
  FRONTEND_URL,
  SUPABASE_URL,
  SUPABASE_KEY
} = process.env;

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

// 🔐 Inicio OAuth
router.get('/auth', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Falta parámetro "shop"');

  const redirectUri = `${APP_URL}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;

  res.redirect(installUrl);
});

// 🔁 Callback OAuth
router.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).send('Faltan parámetros');

  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    });

    const accessToken = tokenRes.data.access_token;

    await supabase.from('shops').upsert({ shop, access_token: accessToken });

    const themes = await axios.get(`https://${shop}/admin/api/2023-10/themes.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    const mainTheme = themes.data.themes.find((t: any) => t.role === 'main');
    if (!mainTheme) return res.status(400).send("No se encontró un theme principal");

    const themeId = mainTheme.id;

    try {
      await axios.put(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
        asset: {
          key: 'snippets/subete_widget.liquid',
          value: `<script src="${FRONTEND_URL}/embed.js" defer></script>`
        }
      }, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
    } catch (err: any) {
      console.warn("⚠️ No se pudo crear el snippet:", err.response?.data || err.message);
    }

    try {
      const layoutAsset = await axios.get(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
        params: { 'asset[key]': 'layout/theme.liquid' }
      });

      let themeLiquid = layoutAsset.data.asset.value;
      const snippetCall = `{% render 'subete_widget' %}`;

      if (!themeLiquid.includes(snippetCall)) {
        themeLiquid = themeLiquid.replace('</body>', `  ${snippetCall}\n</body>`);

        await axios.put(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
          asset: {
            key: 'layout/theme.liquid',
            value: themeLiquid
          }
        }, {
          headers: { 'X-Shopify-Access-Token': accessToken }
        });
      }
    } catch (err: any) {
      console.warn("⚠️ No se pudo modificar theme.liquid:", err.response?.data || err.message);
    }

    res.send("✅ ¡App instalada y widget insertado!");
  } catch (err: any) {
    console.error("❌ Error en callback:", err.response?.data || err.message);
    res.status(500).send("Error autenticando con Shopify");
  }
});

// 🧩 Crear campaña
router.post('/api/create-campaign', async (req, res) => {
  const { name, goal, shop } = req.body;
  if (!name || !goal || !shop) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    const { data: shopData, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("shop", shop)
      .single();

    if (shopError || !shopData) {
      return res.status(404).json({ error: "Tienda no registrada" });
    }

    const { error: insertError } = await supabase.from("campaigns").insert({
      name,
      goal,
      shop_id: shopData.id
    });

    if (insertError) {
      console.error("❌ Error al insertar campaña:", insertError);
      return res.status(500).json({ error: "Error al crear campaña" });
    }

    return res.status(200).json({ message: "Campaña creada" });
  } catch (err) {
    console.error("❌ Error inesperado:", err);
    return res.status(500).json({ error: "Error del servidor" });
  }
});

// 🧾 Obtener campañas por tienda
router.get("/api/campaigns", async (req, res) => {
  const { shop } = req.query;

  if (!shop || typeof shop !== "string") {
    return res.status(400).json({ error: "Parámetro 'shop' requerido" });
  }

  const { data: shopData, error: shopError } = await supabase
    .from("shops")
    .select("id")
    .eq("shop", shop)
    .single();

  if (shopError || !shopData) {
    return res.status(404).json({ error: "Tienda no encontrada" });
  }

  try {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("shop_id", shopData.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error al obtener campañas:", error);
      return res.status(500).json({ error: "Error en Supabase" });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Error inesperado:", err);
    return res.status(500).json({ error: "Error del servidor" });
  }
});

// 🔍 Obtener campaña por ID
router.get("/api/campaigns/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return res.status(404).json({ error: "Campaña no encontrada" });
  return res.status(200).json(data);
});

// 👥 Participantes por campaña
router.get("/api/participants", async (req, res) => {
  const { campaign_id } = req.query;

  const { data, error } = await supabase
    .from("participants")
    .select("id, joined_at, clients(name, email)")
    .eq("campaign_id", campaign_id)
    .order("joined_at");

  if (error) {
    console.error("❌ Error fetching participants:", error);
    return res.status(500).json({ error: "No se encontraron participantes" });
  }

  // Transformar respuesta para que sea más amigable en el frontend
  const parsed = data.map((p) => ({
    id: p.id,
    name: p.clients?.name,
    email: p.clients?.email,
    joined_at: p.joined_at,
  }));

  return res.json(parsed);
});


// ✅ Registrar participante
router.post("/api/participants", async (req, res) => {
  const { email, name, campaign_id } = req.body;

  if (!email || !name || !campaign_id) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const { data: existingClient } = await supabase
      .from("clients")
      .select("*")
      .eq("email", email)
      .single();

    let client_id: string;

    if (existingClient) {
      client_id = existingClient.id;
    } else {
      const { data: newClient, error: insertErr } = await supabase
        .from("clients")
        .insert({ email, name })
        .select()
        .single();

      if (insertErr || !newClient) {
        console.error("❌ Error inserting client:", insertErr);
        return res.status(500).json({ error: "Failed to create client" });
      }

      client_id = newClient.id;
    }

    const { error: participantErr } = await supabase
      .from("participants")
      .insert({ client_id, campaign_id });

    if (participantErr) {
      if (participantErr.code === "23505") {
        return res.status(409).json({ error: "Already joined this campaign" });
      }

      console.error("❌ Error inserting participant:", participantErr);
      return res.status(500).json({ error: "Failed to join campaign" });
    }

    return res.status(200).json({ message: "Joined campaign successfully" });
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

export default router;
