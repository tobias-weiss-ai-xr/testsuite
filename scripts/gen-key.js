const c = require('crypto');
const fs = require('fs');
const kp = c.generateKeyPairSync('rsa', {modulusLength: 2048});
const k = kp.privateKey.export({type: 'pkcs1', format: 'pem'});
fs.writeFileSync(process.argv[2] || '/out/tls-key.pem', k);
console.log('Key generated');
