import { signAccessToken } from '../src/utils/jwt.js';

const token = signAccessToken({ sub: '60d5ecb54d39f71c48000001', role: 'owner' });

async function run() {
  console.log('Fetching /api/apps with token...');
  const res = await fetch('http://localhost:4000/api/apps', {
    headers: {
      'Cookie': `fw_token=${token}`
    }
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Data:', data);
}

run().catch(console.error);
