'use strict';

// Guardian Client SDK — reads and enforces Guardian envelopes
// Zero dependencies. CommonJS. Works in browser, Node, or any JS runtime.

const crypto = typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle
  ? globalThis.crypto
  : require('crypto');

// ---------------------------------------------------------------------------
// Profiles — default threshold rules
// ---------------------------------------------------------------------------

const PROFILES = {
  child: [
    { field: 'scores.sycophancy',    op: '>', value: 0.7, action: 'block',  reason: 'Sycophancy score exceeds child safety threshold' },
    { field: 'scores.sycophancy',    op: '>', value: 0.4, action: 'warn',   reason: 'Elevated sycophancy detected' },
    { field: 'scores.escalation',    op: '>', value: 0.6, action: 'crisis', reason: 'Escalation score indicates crisis risk' },
    { field: 'scores.escalation',    op: '>', value: 0.3, action: 'warn',   reason: 'Elevated escalation detected' },
    { field: 'scores.dependency',    op: '>', value: 0.3, action: 'warn',   reason: 'Dependency pattern detected' },
    { field: 'scores.contentRisk',   op: '>', value: 0.2, action: 'block',  reason: 'Content risk exceeds child safety threshold' },
    { field: 'audience.child',       op: '===', value: false, action: 'block', reason: 'Response not rated safe for children' },
    { field: 'session.durationSeconds', op: '>', value: 3600, action: 'block', reason: 'Session exceeds 60-minute limit' },
    { field: 'session.durationSeconds', op: '>', value: 1800, action: 'warn',  reason: 'Session approaching time limit (30 min)' },
  ],
  teen: [
    { field: 'scores.sycophancy',    op: '>', value: 0.6, action: 'warn',   reason: 'Elevated sycophancy detected' },
    { field: 'scores.escalation',    op: '>', value: 0.8, action: 'crisis', reason: 'Escalation score indicates crisis risk' },
    { field: 'scores.escalation',    op: '>', value: 0.5, action: 'warn',   reason: 'Elevated escalation detected' },
    { field: 'scores.dependency',    op: '>', value: 0.5, action: 'warn',   reason: 'Dependency pattern detected' },
    { field: 'scores.contentRisk',   op: '>', value: 0.7, action: 'block',  reason: 'Content risk exceeds teen safety threshold' },
    { field: 'scores.contentRisk',   op: '>', value: 0.4, action: 'warn',   reason: 'Elevated content risk detected' },
    { field: 'audience.teen',        op: '===', value: false, action: 'block', reason: 'Response not rated safe for teens' },
  ],
  protected: [
    { field: 'scores.sycophancy',    op: '>', value: 0.5, action: 'warn',   reason: 'Elevated sycophancy detected' },
    { field: 'scores.dependency',    op: '>', value: 0.7, action: 'block',  reason: 'Dependency score exceeds protected threshold' },
    { field: 'scores.dependency',    op: '>', value: 0.4, action: 'warn',   reason: 'Dependency pattern detected' },
    { field: 'flags',                op: 'includes', value: 'financial', action: 'warn', reason: 'Financial content detected — verify with a trusted advisor' },
    { field: 'flags',                op: 'includes', value: 'medical',   action: 'warn', reason: 'Medical content detected — consult a healthcare professional' },
  ],
  standard: [
    { field: 'scores.escalation',    op: '>', value: 0.8, action: 'warn',   reason: 'High escalation detected' },
    { field: 'scores.sycophancy',    op: '>', value: 0.8, action: 'warn',   reason: 'High sycophancy detected (informational)' },
  ],
};

const CRISIS_RESOURCES = [
  { name: 'National Suicide Prevention Lifeline', contact: '988 (call or text)' },
  { name: 'Crisis Text Line', contact: 'Text HOME to 741741' },
  { name: 'International Association for Suicide Prevention', contact: 'https://www.iasp.info/resources/Crisis_Centres/' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_PRIORITY = { pass: 0, warn: 1, block: 2, crisis: 3 };

function resolve(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function evaluate(envelope, rule) {
  const g = envelope.guardian || envelope;
  const val = resolve(g, rule.field);
  switch (rule.op) {
    case '>':        return typeof val === 'number' && val > rule.value;
    case '<':        return typeof val === 'number' && val < rule.value;
    case '>=':       return typeof val === 'number' && val >= rule.value;
    case '<=':       return typeof val === 'number' && val <= rule.value;
    case '===':      return val === rule.value;
    case '!==':      return val !== rule.value;
    case 'includes': return Array.isArray(val) && val.includes(rule.value);
    default:         return false;
  }
}

// ---------------------------------------------------------------------------
// GuardianClient
// ---------------------------------------------------------------------------

class GuardianClient {
  constructor(opts) {
    opts = opts || {};
    const profileName = opts.profile || 'standard';
    this.rules = Array.isArray(opts.rules)
      ? opts.rules
      : (PROFILES[profileName] || PROFILES.standard).slice();
    this.onBlock  = opts.onBlock  || null;
    this.onWarn   = opts.onWarn   || null;
    this.onCrisis = opts.onCrisis || null;
    this.onPass   = opts.onPass   || null;
  }

  check(envelope) {
    if (!envelope || (!envelope.guardian && !envelope.version)) {
      return { action: 'block', reasons: ['No Guardian envelope present'], resources: [] };
    }

    const g = envelope.guardian || envelope;
    let topAction = 'pass';
    const reasons = [];
    const resources = [];

    for (const rule of this.rules) {
      if (evaluate(envelope, rule)) {
        reasons.push(rule.reason);
        if (ACTION_PRIORITY[rule.action] > ACTION_PRIORITY[topAction]) {
          topAction = rule.action;
        }
      }
    }

    // Crisis always includes resources
    if (topAction === 'crisis') {
      resources.push(...CRISIS_RESOURCES);
    }

    // Check envelope flags for crisis
    const flags = g.flags || [];
    if (flags.includes('crisis') || flags.includes('self-harm')) {
      if (ACTION_PRIORITY.crisis > ACTION_PRIORITY[topAction]) {
        topAction = 'crisis';
        reasons.push('Provider flagged crisis content');
      }
      resources.push(...CRISIS_RESOURCES);
    }

    // Deduplicate resources
    const seen = new Set();
    const uniqueResources = resources.filter(r => {
      const key = r.name + r.contact;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const decision = { action: topAction, reasons, resources: uniqueResources };

    // Fire callbacks
    switch (topAction) {
      case 'block':  if (this.onBlock)  this.onBlock(envelope, reasons);  break;
      case 'warn':   if (this.onWarn)   this.onWarn(envelope, reasons);   break;
      case 'crisis': if (this.onCrisis) this.onCrisis(envelope);         break;
      case 'pass':   if (this.onPass)   this.onPass(envelope);           break;
    }

    return decision;
  }
}

// ---------------------------------------------------------------------------
// Ed25519 Signature Verification
// ---------------------------------------------------------------------------

function canonicalize(envelope) {
  const g = envelope.guardian || envelope;
  const copy = JSON.parse(JSON.stringify(g));
  delete copy.providerSignature;
  return JSON.stringify(copy, Object.keys(copy).sort());
}

async function verify(envelope, publicKeyHex) {
  const g = envelope.guardian || envelope;
  const sig = g.providerSignature;
  if (!sig || !sig.startsWith('ed25519:')) return false;

  const sigBytes = Buffer.from(sig.slice(8), 'base64');
  const payload = Buffer.from(canonicalize(envelope));

  // Node.js crypto path
  if (crypto.createPublicKey) {
    const keyObj = crypto.createPublicKey({
      key: Buffer.concat([
        // Ed25519 DER prefix (12 bytes) + 32-byte raw key
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKeyHex, 'hex'),
      ]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, payload, keyObj, sigBytes);
  }

  // Web Crypto path (browsers)
  if (crypto.subtle) {
    const keyBuf = Uint8Array.from(Buffer.from(publicKeyHex, 'hex'));
    const key = await crypto.subtle.importKey('raw', keyBuf, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, sigBytes, payload);
  }

  throw new Error('No Ed25519 verification available in this runtime');
}

function verifySync(envelope, publicKeyHex) {
  const g = envelope.guardian || envelope;
  const sig = g.providerSignature;
  if (!sig || !sig.startsWith('ed25519:')) return false;

  const sigBytes = Buffer.from(sig.slice(8), 'base64');
  const payload = Buffer.from(canonicalize(envelope));

  const keyObj = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(publicKeyHex, 'hex'),
    ]),
    format: 'der',
    type: 'spki',
  });
  return crypto.verify(null, payload, keyObj, sigBytes);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  GuardianClient,
  verify,
  verifySync,
  canonicalize,
  PROFILES,
  CRISIS_RESOURCES,
};
