const sinesp = require('sinesp-api');

const placa = process.argv[2] || 'GFT6E86';

console.log('Consultando placa:', placa);

sinesp.search(placa)
    .then(dados => {
        console.log('\n✅ Sucesso!');
        console.log(JSON.stringify(dados, null, 2));
    })
    .catch(err => {
        console.log('\n❌ Erro:', err.message);
    });
