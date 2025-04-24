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

// INICIO OAUTH
router.get('/auth', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Falta parámetro "shop"');

  const redirectUri = `${APP_URL}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;

  res.redirect(installUrl);
});

// CALLBACK OAUTH
router.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).send('Faltan parámetros');

  try {
    // 1. Obtener el token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    });

    const accessToken = tokenRes.data.access_token;

    // 2. Guardar en Supabase
    await supabase.from('shops').upsert({ shop, access_token: accessToken });

    // 3. Obtener theme principal
    const themes = await axios.get(`https://${shop}/admin/api/2023-10/themes.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      }
    });

    const mainTheme = themes.data.themes.find((t: any) => t.role === 'main');
    if (!mainTheme) return res.status(400).send("No se encontró un theme principal");

    const themeId = mainTheme.id;

    // 4. Crear snippet
    await axios.put(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
      asset: {
        key: 'snippets/subete_widget.liquid',
        value: `<script src="${FRONTEND_URL}/embed.js" defer></script>`
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    // 5. Insertar en layout/theme.liquid
    const layoutAsset = await axios.get(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      },
      params: {
        'asset[key]': 'layout/theme.liquid'
      }
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
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      });
    }

    res.send("✅ ¡App instalada y widget insertado!");
  } catch (err: any) {
    console.error("❌ Error en callback:", err.response?.data || err.message);
    res.status(500).send("Error autenticando con Shopify");
  }
});

export default router;