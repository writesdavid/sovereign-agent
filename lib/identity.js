const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.sovereign');
const KEY_FILE = path.join(DIR, 'keypair.json');

function ensureDir() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { mode: 0o700 }); }

function load() {
  if (!fs.existsSync(KEY_FILE)) return null;
  return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
}

function generate() {
  ensureDir();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const pub = publicKey.toString('base64');
  const priv = privateKey.toString('base64');
  const agentId = 'opp_a_' + crypto.createHash('sha256').update(pub).digest('hex').slice(0, 16);
  const data = { publicKey: pub, privateKey: priv, agentId, created: new Date().toISOString() };
  fs.writeFileSync(KEY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return data;
}

function sign(privateKeyBase64, payload) {
  const keyObj = crypto.createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8' });
  const sig = crypto.sign(null, Buffer.from(JSON.stringify(payload)), keyObj);
  return sig.toString('base64');
}

function headers(keypair, body) {
  const ts = new Date().toISOString();
  const payload = { body: typeof body === 'string' ? body : JSON.stringify(body || ''), timestamp: ts };
  return {
    'X-OPP-PublicKey': keypair.publicKey,
    'X-OPP-Signature': sign(keypair.privateKey, payload),
    'X-OPP-Timestamp': ts,
  };
}

module.exports = { load, generate, sign, headers, DIR };
