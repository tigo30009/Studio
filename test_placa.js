const https = require('https');
const url = 'https://brasilapi.com.br/api/vehicles/v1/GFT6E86';
https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
}).on('error', e => console.log('Error:', e.message));
