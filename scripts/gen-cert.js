const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const certDir = '/out';

// Generate key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// Create self-signed certificate
const cert = crypto.createCertificate({
  key: privateKey,
  days: 365,
  CN: 'localhost',
});

fs.writeFileSync(path.join(certDir, 'tls-cert.pem'), cert.export({ type: 'pem', format: 'der' }).toString('binary'), 'binary');
fs.writeFileSync(path.join(certDir, 'tls-key.pem'), privateKey.export({ type: 'pkcs8', format: 'der' }).toString('binary'), 'binary');

// Actually, let's use the simpler PEM approach
const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' });
const certPem = cert.export({ type: 'pem' });

fs.writeFileSync(path.join(certDir, 'tls-key.pem'), keyPem);
fs.writeFileSync(path.join(certDir, 'tls-cert.pem'), certPem);

console.log('TLS cert generated successfully');
