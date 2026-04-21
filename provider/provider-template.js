#!/usr/bin/env node

/**
 * OPP Provider Template
 *
 * Make your service sovereign-agent compatible in 10 minutes.
 *
 * 1. Edit SERVICE_CONFIG — your name, description, domains
 * 2. Edit TERMS — what you offer, what you need
 * 3. Edit resolve() — what your service actually does
 * 4. Run: node provider-template.js
 *
 * That's it. Your service speaks OPP. Any sovereign agent can find it,
 * negotiate with it, and query it.
 */

const http = require('http');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════
// 1. EDIT THIS — describe your service
// ═══════════════════════════════════════════════════

const SERVICE_CONFIG = {
  name: 'My Service',
  description: 'What your service does in one sentence.',
  version: '0.1.0',
  domains: ['your-domain'],           // what kind of data you serve
  port: 3001,                          // port to run on
  contact: 'you@example.com',
};

// ═══════════════════════════════════════════════════
// 2. EDIT THIS — what you offer and what you need
// ═══════════════════════════════════════════════════

const TERMS = {
  description: 'What agents get from your service.',
  cost: null,                          // null = free. Or: { amount: 5, currency: 'USD', model: 'per-call' }
  timeframe: 'instant',                // 'instant', '1h', '24h'
  requirements: [],                    // what you need from the agent: ['zip', 'email', 'name']
  confidence: 0.9,                     // how well you can typically fulfill intents
};

// ═══════════════════════════════════════════════════
// 3. EDIT THIS — what your service does
// ═══════════════════════════════════════════════════

/**
 * Resolve an intent.
 *
 * This is your service's brain. An agent sends an intent
 * (a goal + constraints). You return data.
 *
 * @param {object} intent
 * @param {string} intent.goal - what the agent wants, plain English
 * @param {object} intent.constraints - structured constraints (zip, name, etc)
 * @param {object} identity - the agent's verified identity
 * @returns {object} your response data
 */
async function resolve(intent, identity) {
  // ── REPLACE THIS WITH YOUR LOGIC ──
  //
  // Example: a local weather service
  //
  //   const zip = intent.constraints.zip;
  //   const weather = await fetchWeatherForZip(zip);
  //   return {
  //     temperature: weather.temp,
  //     conditions: weather.conditions,
  //     forecast: weather.forecast,
  //   };
  //
  // Example: a real estate listing service
  //
  //   const zip = intent.constraints.zip;
  //   const listings = await searchListings({ zip, budget: intent.constraints.maxPrice });
  //   return {
  //     listings: listings.slice(0, 10),
  //     total: listings.length,
  //   };

  return {
    message: 'This is a template. Replace resolve() with your logic.',
    received: intent,
  };
}


// ═══════════════════════════════════════════════════
// EVERYTHING BELOW HANDLES OPP — YOU DON'T EDIT THIS
// ═══════════════════════════════════════════════════

// ─── Ed25519 Verification ───

function verifyRequest(headers, body) {
  try {
    const publicKey = headers['x-opp-publickey'];
    const signature = headers['x-opp-signature'];
    const timestamp = headers['x-opp-timestamp'];

    if (!publicKey || !signature || !timestamp) return null;

    // Reject requests older than 5 minutes
    const age = Date.now() - new Date(timestamp).getTime();
    if (age > 5 * 60 * 1000) return null;

    const payload = JSON.stringify({ body: typeof body === 'string' ? body : JSON.stringify(body || ''), timestamp });
    const keyObj = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    const valid = crypto.verify(null, Buffer.from(payload), keyObj, Buffer.from(signature, 'base64'));

    if (!valid) return null;

    const agentId = 'opp_a_' + crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
    return { agentId, publicKey, verified: true };
  } catch {
    return null;
  }
}

// ─── Response Signing ───

let signingKey = null;
let signingPublicKey = null;

function initSigning() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  signingKey = crypto.createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' });
  signingPublicKey = publicKey.toString('base64');
}

function signResponse(data) {
  if (!signingKey) return null;
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sig = crypto.sign(null, Buffer.from(canonical), signingKey);
  return {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-jcs-2022',
    created: new Date().toISOString(),
    proofValue: sig.toString('base64url'),
  };
}

// ─── OPP Envelope ───

function envelope(data, domain) {
  const env = {
    domain: domain || SERVICE_CONFIG.domains[0],
    source: SERVICE_CONFIG.name,
    freshness: new Date().toISOString(),
    data,
  };
  const proof = signResponse(env);
  if (proof) env.proof = proof;
  return env;
}

// ─── Route Handling ───

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve(body || null); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-OPP-PublicKey, X-OPP-Signature, X-OPP-Timestamp',
  });
  res.end(JSON.stringify(data));
}

// ─── Server ───

initSigning();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${SERVICE_CONFIG.port}`);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-OPP-PublicKey, X-OPP-Signature, X-OPP-Timestamp',
    });
    res.end();
    return;
  }

  // ─── OPP Manifest ───
  if (path === '/.well-known/opp.json') {
    return json(res, {
      name: SERVICE_CONFIG.name,
      version: SERVICE_CONFIG.version,
      description: SERVICE_CONFIG.description,
      domains: SERVICE_CONFIG.domains,
      publicKey: signingPublicKey,
      signing: { algorithm: 'Ed25519', format: 'W3C Data Integrity' },
      endpoints: [
        { path: '/resolve', method: 'POST', description: 'Submit an intent for resolution' },
        { path: '/terms', method: 'GET', description: 'Get service terms' },
        { path: '/negotiate', method: 'POST', description: 'Negotiate terms' },
      ],
      sovereignty: {
        identityRequired: false,
        dataRetention: 'none',
        agentMemoryAccess: 'never',
      },
      contact: SERVICE_CONFIG.contact,
    });
  }

  // ─── Terms ───
  if (path === '/terms' && method === 'GET') {
    return json(res, envelope(TERMS, 'terms'));
  }

  // ─── Resolve Intent ───
  if (path === '/resolve' && method === 'POST') {
    const body = await parseBody(req);
    if (!body || !body.goal) {
      return json(res, { error: 'Request must include a goal.' }, 400);
    }

    // Verify agent identity (optional but logged)
    const identity = verifyRequest(req.headers, body);

    // Resolve
    try {
      const result = await resolve(body, identity);
      return json(res, envelope(result));
    } catch (err) {
      return json(res, { error: 'Resolution failed: ' + err.message }, 500);
    }
  }

  // ─── Negotiate ───
  if (path === '/negotiate' && method === 'POST') {
    const body = await parseBody(req);
    const identity = verifyRequest(req.headers, body);

    // Simple negotiation: check if agent's constraints match our terms
    const agentMax = body?.constraints?.maxCost;
    const ourCost = TERMS.cost?.amount || 0;

    let status = 'accepted';
    let finalTerms = { ...TERMS };

    if (agentMax !== undefined && agentMax < ourCost) {
      // Agent can't afford our terms — offer reduced scope
      status = 'counter';
      finalTerms.description += ' (reduced scope)';
      finalTerms.confidence *= 0.7;
    }

    // Check requirements
    const missing = TERMS.requirements.filter(r => !body?.constraints?.[r]);
    if (missing.length > 0) {
      status = 'needs_info';
    }

    return json(res, envelope({
      status,
      terms: finalTerms,
      missing: missing.length > 0 ? missing : undefined,
      agent: identity ? identity.agentId : 'anonymous',
    }, 'negotiation'));
  }

  // ─── Health ───
  if (path === '/' || path === '/health') {
    return json(res, {
      service: SERVICE_CONFIG.name,
      status: 'operational',
      opp: true,
      domains: SERVICE_CONFIG.domains,
    });
  }

  // 404
  json(res, { error: 'Not found' }, 404);
});

server.listen(SERVICE_CONFIG.port, () => {
  console.log('');
  console.log(`  ══ ${SERVICE_CONFIG.name} ══`);
  console.log(`  OPP-compatible service running on port ${SERVICE_CONFIG.port}`);
  console.log('');
  console.log('  Endpoints:');
  console.log(`    GET  http://localhost:${SERVICE_CONFIG.port}/.well-known/opp.json`);
  console.log(`    GET  http://localhost:${SERVICE_CONFIG.port}/terms`);
  console.log(`    POST http://localhost:${SERVICE_CONFIG.port}/resolve`);
  console.log(`    POST http://localhost:${SERVICE_CONFIG.port}/negotiate`);
  console.log('');
  console.log('  Any sovereign agent can now discover and query this service.');
  console.log('');
});
