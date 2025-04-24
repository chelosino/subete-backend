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
  
  try {
    
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    });
console.log("1");
    const accessToken = tokenRes.data.access_token;
console.log(accessToken);
    // ✅ GUARDAR EN SUPABASE
    await supabase.from('shops').upsert({ shop, access_token: accessToken });
console.log("2");
    // 🔍 OBTENER THEME PRINCIPAL
    const themes = await axios.get(`https://${shop}/admin/api/2023-10/themes.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
console.log("🧵 Themes recibidos:", themes.data.themes);
    const mainTheme = themes.data.themes.find(t => t.role === 'main');
    if (!mainTheme) {
      console.error("❌ No se encontró un theme principal para la tienda.");
      return res.status(400).send("No se encontró un theme principal.");
    }
    const themeId = mainTheme.id;
console.log("4");
    // 🧩 CREAR SNIPPET LIQUID
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
console.log("5");
    // 🧷 INSERTAR EN THEME.LIQUID
    const layoutAsset = await axios.get(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      },
      params: {
        'asset[key]': 'layout/theme.liquid'
      }
    });
console.log("6");
    let themeLiquid = layoutAsset.data.asset.value;
    const snippetCall = `{% render 'subete_widget' %}`;
console.log("7");
    if (!themeLiquid.includes(snippetCall)) {
      themeLiquid = themeLiquid.replace('</body>', `  ${snippetCall}\n</body>`);
console.log("8");
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
console.log("9");
    res.send("✅ ¡Widget instalado correctamente!");
  } catch (err) {
    console.error("❌ Error en callback:");
    console.error("➡️ Mensaje:", err.message);
    console.error("➡️ Shopify responde:", err.response?.data || err.response || err);
    res.status(500).send("Error autenticando con Shopify");
  }
});
app.get("/", (req, res) => {
  const { shop } = req.query;

  if (!shop) return res.status(400).send("Falta parámetro 'shop'");

  res.send(`
    <html>
      <body>
        <h2>✅ App "Súbete al carro" está instalada para ${shop}</h2>
        <p>La integración fue exitosa.</p>
        <script>
          window.location.href = "${FRONTEND_URL}/widget?shop=${shop}";
        </script>
      </body>
    </html>
  `);
});


app.listen(port, () => {
  console.log(`Servidor Shopify backend corriendo en http://localhost:${port}`);
});
