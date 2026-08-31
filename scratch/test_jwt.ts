import jwt from 'jsonwebtoken';

const payload = { sub: '60d5ecb54d39f71c48000001', role: 'owner' };
const secret = 'vaptapp-dev-secret-nao-use-em-producao-000000';

try {
  const token = jwt.sign(payload, secret, { expiresIn: '7d', issuer: 'vaptapp-api' });
  console.log('Token:', token);

  const decoded = jwt.verify(token, secret, { issuer: 'vaptapp-api' });
  console.log('Decoded:', decoded);
} catch (error) {
  console.error('Error:', error);
}
