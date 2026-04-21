#!/usr/bin/env node

/**
 * Example OPP Provider: Local Weather
 *
 * A real, working provider built from the template.
 * Queries Open-Meteo (free, no API key) and serves weather
 * data through the OPP protocol.
 *
 * Run:   node example-local-weather.js
 * Query: sovereign-agent "what's the weather in 49506?"
 *
 * This is a complete example of "accept sovereign intents here."
 */

const http = require('http');
const crypto = require('crypto');

// ── SERVICE CONFIG ──

const SERVICE_CONFIG = {
  name: 'Local Weather Provider',
  description: 'Hyperlocal weather from Open-Meteo. Free. No API key. OPP signed.',
  version: '0.1.0',
  domains: ['weather'],
  port: 3002,
  contact: 'example@sovereign-agent.dev',
};

const TERMS = {
  description: '7-day forecast with hourly temperature, precipitation, and wind. Free. No data retained.',
  cost: null,
  timeframe: 'instant',
  requirements: ['zip'],
  confidence: 0.92,
};

// ── ZIP to LAT/LNG (small lookup for demo) ──
const ZIP_COORDS = {
  '10001': [40.75, -73.99],
  '90210': [34.09, -118.41],
  '49506': [42.95, -85.62],
  '60601': [41.88, -87.62],
  '30301': [33.75, -84.39],
  '48201': [42.33, -83.05],
  '02101': [42.36, -71.06],
  '98101': [47.61, -122.33],
  '94102': [37.78, -122.41],
  '33101': [25.77, -80.19],
};

// ── RESOLVE ──

async function resolve(intent, identity) {
  const zip = intent.constraints?.zip || intent.goal?.match(/\b\d{5}\b/)?.[0];
  if (!zip) return { error: 'Need a ZIP code. Include one in your intent.' };

  const coords = ZIP_COORDS[zip];
  if (!coords) return { error: `ZIP ${zip} not in demo lookup. Add it to ZIP_COORDS or use a geocoding API.` };

  const [lat, lon] = coords;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) return { error: 'Open-Meteo returned ' + res.status };
  const data = await res.json();

  const current = data.current;
  const daily = data.daily;

  const WEATHER_CODES = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers',
    81: 'Heavy rain showers', 82: 'Violent rain', 85: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail',
  };

  return {
    zip,
    coordinates: { latitude: lat, longitude: lon },
    current: {
      temperature: current.temperature_2m + '°F',
      conditions: WEATHER_CODES[current.weathercode] || 'Unknown',
      wind: current.windspeed_10m + ' mph',
      humidity: current.relative_humidity_2m + '%',
    },
    forecast: daily.time.map((date, i) => ({
      date,
      high: daily.temperature_2m_max[i] + '°F',
      low: daily.temperature_2m_min[i] + '°F',
      precipChance: daily.precipitation_probability_max[i] + '%',
    })),
    source: 'Open-Meteo (open-meteo.com)',
    dataRetention: 'none',
  };
}


// ═══════════════════════════════════════════════════
// OPP PROTOCOL HANDLER (same as template — don't edit)
// ═══════════════════════════════════════════════════

function verifyRequest(headers, body) {
  try {
    const publicKey = headers['x-opp-publickey'];
    const signature = headers['x-opp-signature'];
    const timestamp = headers['x-opp-timestamp'];
    if (!publicKey || !signature || !timestamp) return null;
    const age = Date.now() - new Date(timestamp).getTime();
    if (age > 5 * 60 * 1000) return null;
    const payload = JSON.stringify({ body: typeof body === 'string' ? body : JSON.stringify(body || ''), timestamp });
    const keyObj = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    const valid = crypto.verify(null, Buffer.from(payload), keyObj, Buffer.from(signature, 'base64'));
    if (!valid) return null;
    return { agentId: 'opp_a_' + crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16), publicKey, verified: true };
  } catch { return null; }
}

let signingKey = null, signingPublicKey = null;
function initSigning() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  signingKey = crypto.createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' });
  signingPublicKey = publicKey.toString('base64');
}
function signResponse(data) {
  if (!signingKey) return null;
  const sig = crypto.sign(null, Buffer.from(JSON.stringify(data, Object.keys(data).sort())), signingKey);
  return { type: 'DataIntegrityProof', cryptosuite: 'eddsa-jcs-2022', created: new Date().toISOString(), proofValue: sig.toString('base64url') };
}
function envelope(data, domain) {
  const env = { domain: domain || SERVICE_CONFIG.domains[0], source: SERVICE_CONFIG.name, freshness: new Date().toISOString(), data };
  const proof = signResponse(env);
  if (proof) env.proof = proof;
  return env;
}
function parseBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b)); } catch { r(b || null); } }); }); }
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-OPP-PublicKey, X-OPP-Signature, X-OPP-Timestamp' }); res.end(JSON.stringify(data)); }

initSigning();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${SERVICE_CONFIG.port}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-OPP-PublicKey, X-OPP-Signature, X-OPP-Timestamp' }); res.end(); return; }
  if (path === '/.well-known/opp.json') return json(res, { name: SERVICE_CONFIG.name, version: SERVICE_CONFIG.version, description: SERVICE_CONFIG.description, domains: SERVICE_CONFIG.domains, publicKey: signingPublicKey, signing: { algorithm: 'Ed25519', format: 'W3C Data Integrity' }, endpoints: [{ path: '/resolve', method: 'POST' }, { path: '/terms', method: 'GET' }], sovereignty: { identityRequired: false, dataRetention: 'none', agentMemoryAccess: 'never' }, contact: SERVICE_CONFIG.contact });
  if (path === '/terms') return json(res, envelope(TERMS, 'terms'));
  if (path === '/resolve' && req.method === 'POST') { const body = await parseBody(req); const id = verifyRequest(req.headers, body); try { const result = await resolve(body, id); return json(res, envelope(result)); } catch (e) { return json(res, { error: e.message }, 500); } }
  if (path === '/' || path === '/health') return json(res, { service: SERVICE_CONFIG.name, status: 'operational', opp: true });
  json(res, { error: 'Not found' }, 404);
});

server.listen(SERVICE_CONFIG.port, () => {
  console.log('');
  console.log(`  ══ ${SERVICE_CONFIG.name} ══`);
  console.log(`  Running on port ${SERVICE_CONFIG.port}`);
  console.log('');
  console.log('  Try: curl http://localhost:${SERVICE_CONFIG.port}/.well-known/opp.json');
  console.log('  Try: curl -X POST http://localhost:${SERVICE_CONFIG.port}/resolve \\');
  console.log('       -H "Content-Type: application/json" \\');
  console.log(`       -d '{"goal":"weather","constraints":{"zip":"49506"}}'`);
  console.log('');
});
