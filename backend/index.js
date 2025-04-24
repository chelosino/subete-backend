import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
const port = 3000;

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SCOPES,
  APP_URL,
  FRONTEND_URL,
  SUPABASE_URL,
  SUPABASE_KEY
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 🛠 INICIO OAUTH
app.get('/auth', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const redirectUri = `${APP_URL}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;
  res.redirect(installUrl);
});

// 🔄 CALLBACK OAUTH
app.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).send('Missing params');

  console.log("Recibido en /auth/callback:", req.query);

  try {

    console.log("Credenciales:", {
  key: SHOPIFY_API_KEY,
  secret: SHOPIFY_API_SECRET
});

    console.log("Solicitando token a:", `https://${shop}/admin/oauth/access_token`);
    
    const tokenRes = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const accessToken = tokenRes.data.access_token;

    // ✅ GUARDAR EN SUPABASE
    await supabase.from('shops').upsert({ shop, access_token: accessToken });

    // 🔍 OBTENER THEME PRINCIPAL
    const themes = await axios.get(`https://${shop}/admin/api/2023-10/themes.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      }
    });

    const mainTheme = themes.data.themes.find(t => t.role === 'main');
    const themeId = mainTheme.id;

    // 🧩 CREAR SNIPPET LIQUID
    await axios.put(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
      asset: {
        key: 'snippets/subete_widget.liquid',
        value: `<iframe src="${FRONTEND_URL}?shop=${shop}" style="width:100%;height:600px;border:none;"></iframe>`
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    // 🧷 INSERTAR EN THEME.LIQUID
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

    res.send("✅ ¡Widget instalado correctamente!");
  } catch (err) {
    console.error("❌ Error en callback:", err.response?.data || err.message);
    res.status(500).send("Error autenticando con Shopify");
  }
});

app.listen(port, () => {
  console.log(`Servidor Shopify backend corriendo en http://localhost:${port}`);
});
