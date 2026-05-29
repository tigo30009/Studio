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

// ─── Bytedance Seedream background generation ────────────────────────────────
app.post('/bytedance-bg', upload.single('image'), async (req, res) => {
  try {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ARK_API_KEY não configurada no servidor.' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const payload = {
      model: 'seedream-5-0-260128',
      prompt: "Photograph the same car from Image 1 at the IDENTICAL camera angle. Preserve every car feature precisely — body shape, paint, badges, grille, headlights, tail lights, side mirrors, wheels, ride height. Preserve ALL visible damage and wear from Image 1: dents, scratches, paint chips, scuffs, rust, cracks, broken parts. Place the car inside a pure white seamless studio with soft, diffused softbox lighting and a subtle shadow underneath. All reflective surfaces — body panels, chrome, headlights, wheel rims — show only soft pale-white reflections of the studio. Windows show glossy reflections of the softbox lighting that obscure the cabin, matching Image 1's reflection density. Remove dealer stickers and plates only. Preserve Image 1's paint color, exposure, gloss, and imperfections.",
      image: [dataUrl],
      sequential_image_generation: 'auto',
      sequential_image_generation_options: { max_images: 3 },
      size: '2K',
      output_format: 'png',
      response_format: 'url',
      watermark: false,
    };

    const response = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.message || 'Erro na API Bytedance' });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('bytedance-bg error:', err);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ─── Bytedance Seedance video generation ─────────────────────────────────────
const os = require('os');
const { randomUUID } = require('crypto');

// Serve /tmp files as public URLs
app.use('/tmp', express.static(os.tmpdir()));

app.post('/generate-video', upload.array('images', 20), async (req, res) => {
  const tmpFiles = [];
  try {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ARK_API_KEY não configurada.' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    const host = req.headers.host || 'studio-xefd.onrender.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    // Save images to /tmp and build public URLs
    const imageUrls = [];
    for (const file of req.files) {
      const filename = `vid_${randomUUID()}.jpg`;
      const filepath = path.join(os.tmpdir(), filename);
      fs.writeFileSync(filepath, file.buffer);
      tmpFiles.push(filepath);
      imageUrls.push(`${protocol}://${host}/tmp/${filename}`);
    }

    // Build content array: text prompt + reference images
    const prompt = `15–20 second vertical 9:16 car promotional video slideshow. Open with 10 seconds of exterior car shots using smooth transitions and motion blur. Follow with interior shots for 5 seconds if available. Overlay bold text callouts highlighting the car's make, model, year, and key features. Close with a 3-second branded outro with large centered text: "Venha agora mesmo visitar a nossa loja". Add upbeat background music. Keep pacing energetic and social-media native for TikTok and Reels.`;

    const content = [
      { type: 'text', text: prompt },
      ...imageUrls.map(url => ({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      })),
    ];

    const payload = {
      model: 'dreamina-seedance-2-0-fast-260128',
      content,
      generate_audio: true,
      ratio: '9:16',
      duration: 15,
      watermark: false,
    };

    const response = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Seedance task error:', err);
      return res.status(response.status).json({ error: err.message || 'Erro ao criar task de vídeo.' });
    }

    const data = await response.json();
    const taskId = data.id;
    if (!taskId) return res.status(500).json({ error: 'Task ID não retornado pela API.' });

    console.log('Seedance task created:', taskId);
    res.json({ task_id: taskId });

    // Cleanup tmp files after 5 minutes
    setTimeout(() => {
      tmpFiles.forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });
    }, 5 * 60 * 1000);

  } catch (err) {
    tmpFiles.forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });
    console.error('generate-video error:', err);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ─── Polling endpoint — check video task status ───────────────────────────────
app.get('/video-status/:taskId', async (req, res) => {
  try {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ARK_API_KEY não configurada.' });

    const { taskId } = req.params;
    console.log(`[video-status] Checking task: ${taskId}`);

    const response = await fetch(`https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error(`[video-status] API error ${response.status}:`, JSON.stringify(err));
      return res.status(response.status).json({ error: err.message || 'Erro ao consultar task.' });
    }

    const data = await response.json();
    console.log(`[video-status] status=${data.status} content=${JSON.stringify(data.content || []).substring(0, 200)}`);

    const status = data.status;
    // API returns content as object {video_url: "..."} or array [{video_url: {...}}]
    let videoUrl = null;
    if (data.content) {
      if (typeof data.content === 'object' && !Array.isArray(data.content) && data.content.video_url) {
        videoUrl = typeof data.content.video_url === 'string' ? data.content.video_url : data.content.video_url.url;
      } else if (Array.isArray(data.content) && data.content[0]) {
        videoUrl = (data.content[0].video_url && data.content[0].video_url.url) || data.content[0].video_url || data.content[0].url || null;
      }
    }
    if (!videoUrl && data.video_url) videoUrl = data.video_url;

    console.log(`[video-status] resolved video_url=${videoUrl}`);
    res.json({ status, video_url: videoUrl, raw: data });
  } catch (err) {
    console.error('video-status error:', err);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ─── Download proxy (avoids CORS for external image URLs) ────────────────────
app.get('/download-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Parâmetro "url" é obrigatório.' });

    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: 'Não foi possível baixar a imagem.' });

    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', 'attachment');
    res.send(buffer);
  } catch (err) {
    console.error('download-proxy error:', err);
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
    console.log('Chamando API de precos...');

    // Timeout de 10 segundos
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.error('IWM preco timeout — chamada abortada após 10s');
    }, 10000);

    let precosRes;
    try {
      precosRes = await fetch(fullUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'client_key':    clientKey,
          'dimensoes':     'marca,modelo,versao,uf,cambio,carroceria,combustivel,blindado,ano_modelo,ano_fabricacao',
          'metricas':      'vl_preco_wm,vl_preco_min_wm,vl_preco_max_wm,vl_iwm',
        },
      });
      clearTimeout(timeout);
      console.log('IWM preco status:', precosRes.status);
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.error('IWM preco fetch error:', fetchErr.message);
      return res.status(502).json({ error: 'Timeout ou erro de conexão com a API IWM.' });
    }

    if (!precosRes.ok) {
      const errText = await precosRes.text();
      console.error('IWM preco error body:', errText);
      return res.status(502).json({ error: 'Erro ao consultar Bureau de Preços.' });
    }

    const precosData = await precosRes.json();
    console.log('IWM preco data:', JSON.stringify(precosData).substring(0, 300));

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
