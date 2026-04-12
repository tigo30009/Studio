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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📸 Abra http://localhost:${PORT} no navegador\n`);
});
