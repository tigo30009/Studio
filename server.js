require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve the HTML app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio_v2_removebg.html'));
});

// Remove background endpoint
app.post('/remove-bg', upload.single('image'), async (req, res) => {
  try {
    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'REMOVE_BG_API_KEY não configurada. Adicione no arquivo .env' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    const formData = new FormData();
    formData.append('image_file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    formData.append('size', 'auto');
    formData.append('bg_color', '');
    formData.append('format', 'png');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.errors?.[0]?.title || 'Erro na Remove.bg API' });
    }

    const buffer = await response.buffer();
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ─── Vehicle data by plate (IWM Bureau de Preços) ────────────────────────────
app.get('/vehicle-data', async (req, res) => {
  try {
    const { placa } = req.query;

    if (!placa) {
      return res.status(400).json({ error: 'Parâmetro "placa" é obrigatório.' });
    }

    const clientId     = process.env.IWM_CLIENT_ID;
    const clientSecret = process.env.IWM_CLIENT_SECRET;
    const clientKey    = process.env.IWM_CLIENT_KEY;

    if (!clientId || !clientSecret || !clientKey) {
      return res.status(500).json({ error: 'Variáveis IWM não configuradas no servidor.' });
    }

    // Step 1 — get access token
    const tokenRes = await fetch('https://iwm.webmotors.com.br/api/token', {
      method: 'POST',
      headers: {
        client_id:     clientId,
        client_secret: clientSecret,
      },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('IWM token error:', errText);
      return res.status(502).json({ error: 'Erro ao obter token IWM.' });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(502).json({ error: 'Token IWM não retornado.' });
    }

    // Step 2 — query vehicle by plate
    const hoje = new Date();
    // Use yesterday's date as reference (API default behavior)
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    const anoRef = ontem.getFullYear();
    const mesRef = String(ontem.getMonth() + 1).padStart(2, '0');

    // Query params — filtros de busca
    const fullUrl = 'https://iwm.webmotors.com.br/api/v2/preco'
      + '?nm_placa='       + placa.toUpperCase()
      + '&ano_referencia=' + anoRef
      + '&mes_referencia=' + mesRef
      + '&tipo_veiculo=CARRO';

    console.log('IWM request URL:', fullUrl);
    console.log('IWM token (primeiros 20 chars):', accessToken.substring(0, 20));
    console.log('IWM client_key:', clientKey);

    const precosRes = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'client_key':    clientKey,
        'dimensoes':     'marca,modelo,versao,uf,cambio,carroceria,combustivel,blindado,ano_modelo,ano_fabricacao',
        'metricas':      'vl_preco_wm,vl_preco_min_wm,vl_preco_max_wm,vl_iwm',
      },
    });

    if (!precosRes.ok) {
      const errText = await precosRes.text();
      console.error('IWM preco error:', errText);
      return res.status(502).json({ error: 'Erro ao consultar Bureau de Preços.' });
    }

    const precosData = await precosRes.json();

    if (precosData.status !== 'SUCCESS' || !precosData.records || precosData.records.length === 0) {
      return res.status(404).json({ error: 'Veículo não encontrado para esta placa.' });
    }

    // Take first record (most relevant)
    const r = precosData.records[0];

    // Map to the format expected by the frontend
    const vehicle = {
      placa:       placa.toUpperCase(),
      marca:       r.marca        || '',
      modelo:      r.modelo       || '',
      versao:      r.versao       || '',
      ano:         r.ano_modelo   ? `${r.ano_modelo}/${r.ano_fabricacao || r.ano_modelo}` : '',
      cambio:      r.cambio       || '',
      carroceria:  r.carroceria   || '',
      combustivel: r.combustivel  || '',
      blindado:    r.blindado     || 'Não',
      estado:      r.uf           || '',
      cidade:      '',            // not returned by IWM
      km:          '',            // not returned by IWM
      cor:         '',            // not returned by IWM
      portas:      '',            // not returned by IWM
      preco:       r.vl_preco_wm  ? Number(r.vl_preco_wm).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '',
      precoMin:    r.vl_preco_min_wm ? Number(r.vl_preco_min_wm).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '',
      precoMax:    r.vl_preco_max_wm ? Number(r.vl_preco_max_wm).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '',
      iwm:         r.vl_iwm       || '',
      itens:       [],            // not returned by IWM
    };

    res.json({ status: 'SUCCESS', vehicle });

  } catch (err) {
    console.error('vehicle-data error:', err);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📸 Abra http://localhost:${PORT} no navegador\n`);
});
