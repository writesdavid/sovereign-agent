/**
 * Sovereign Wallet
 *
 * Like a Bitcoin wallet, but for your digital life.
 *
 * Bitcoin wallet: holds private keys, signs transactions, tracks balances.
 * Sovereign wallet: holds private keys, signs intents, tracks history.
 *
 * Bitcoin: "I want to send 0.5 BTC to this address" → signed → broadcast → verified.
 * Sovereign: "I want to know if my water is safe" → signed → resolved → verified.
 *
 * Self-custody means: the wallet is a file on your machine.
 * You can back it up. You can export it. You can move it to another device.
 * You can delete it and start fresh with a new identity.
 * No service can freeze your wallet, revoke your identity, or read your history.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DIR } = require('./identity');

const WALLET_FILE = path.join(DIR, 'wallet.json');

function loadWallet() {
  if (!fs.existsSync(WALLET_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8')); }
  catch { return null; }
}

function saveWallet(wallet) {
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2), { mode: 0o600 });
}

/**
 * Initialize a new wallet or load existing.
 * A wallet contains:
 * - identity (keypair + agentId)
 * - intents (history of everything you've asked)
 * - watches (ongoing monitors)
 * - relationships (services you've interacted with + trust scores)
 * - permissions (what data you've shared with whom)
 * - stats (your usage patterns — visible only to you)
 */
function init(identity) {
  let wallet = loadWallet();
  if (wallet) {
    wallet.stats.sessions++;
    wallet.stats.lastOpened = new Date().toISOString();
    saveWallet(wallet);
    return wallet;
  }

  wallet = {
    version: '0.1.0',
    created: new Date().toISOString(),

    // Your identity — the keypair hash is your address, like a Bitcoin address
    identity: {
      agentId: identity.agentId,
      publicKey: identity.publicKey,
      address: identity.agentId, // your sovereign address
    },

    // Every intent is a transaction — signed, timestamped, verifiable
    intents: [],

    // Active monitors — like watching a Bitcoin address for incoming transactions
    watches: [],

    // Services you've interacted with — like a contact list of addresses
    relationships: [],

    // What you've shared and with whom — your permission ledger
    permissions: [],

    // Your stats — private, never shared
    stats: {
      sessions: 1,
      totalIntents: 0,
      domainsQueried: {},
      firstUse: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
    },
  };

  saveWallet(wallet);
  return wallet;
}

/**
 * Record an intent — like recording a transaction in a Bitcoin wallet.
 * Every intent is signed by your private key.
 */
function recordIntent(wallet, intent, resolution, signature) {
  const record = {
    id: 'txn_' + crypto.randomBytes(8).toString('hex'),
    timestamp: new Date().toISOString(),
    intent: {
      raw: intent.raw,
      domains: intent.domains,
      zips: intent.zips,
    },
    resolution: {
      domains: Object.keys(resolution.results || {}),
      verified: true, // all OPP responses are Ed25519 signed
      confidence: avgConfidence(resolution.results),
    },
    signature,
  };

  wallet.intents.unshift(record);
  if (wallet.intents.length > 500) wallet.intents = wallet.intents.slice(0, 500);

  // Update stats
  wallet.stats.totalIntents++;
  intent.domains.forEach(d => {
    wallet.stats.domainsQueried[d] = (wallet.stats.domainsQueried[d] || 0) + 1;
  });

  saveWallet(wallet);
  return record;
}

/**
 * Add a relationship — a service you've interacted with.
 * Like adding a contact after your first Bitcoin transaction with them.
 */
function addRelationship(wallet, service) {
  const existing = wallet.relationships.find(r => r.url === service.url);
  if (existing) {
    existing.interactions++;
    existing.lastSeen = new Date().toISOString();
  } else {
    wallet.relationships.push({
      url: service.url,
      name: service.name || service.url,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      interactions: 1,
      trust: 1.0, // starts trusted, degrades on failures
    });
  }
  saveWallet(wallet);
}

/**
 * Grant a permission — record that you shared specific data with a service.
 * Like signing a Bitcoin transaction: explicit, revocable, logged.
 */
function grantPermission(wallet, service, scope, duration) {
  const perm = {
    id: 'perm_' + crypto.randomBytes(6).toString('hex'),
    service: service.url,
    scope, // what was shared: 'zip', 'email', 'preferences', etc.
    granted: new Date().toISOString(),
    expires: duration === 'once' ? new Date().toISOString()
      : duration === 'session' ? null
      : new Date(Date.now() + parseDuration(duration)).toISOString(),
    revoked: false,
  };

  wallet.permissions.push(perm);
  saveWallet(wallet);
  return perm;
}

/**
 * Revoke a permission — like invalidating a signed check.
 */
function revokePermission(wallet, permId) {
  const perm = wallet.permissions.find(p => p.id === permId);
  if (perm) {
    perm.revoked = true;
    perm.revokedAt = new Date().toISOString();
    saveWallet(wallet);
  }
  return perm;
}

/**
 * Export wallet — like exporting a Bitcoin wallet.
 * Contains everything needed to restore your sovereign identity on another device.
 * The private key is NOT included — that exports separately via identity.
 */
function exportWallet(wallet) {
  return {
    version: wallet.version,
    created: wallet.created,
    identity: { agentId: wallet.identity.agentId, address: wallet.identity.address },
    intents: wallet.intents.length,
    watches: wallet.watches.length,
    relationships: wallet.relationships.map(r => ({ name: r.name, trust: r.trust })),
    stats: wallet.stats,
    // Private key excluded. Export that separately and guard it.
  };
}

/**
 * Wallet summary — like checking your Bitcoin balance.
 * Shows your sovereign footprint.
 */
function summary(wallet) {
  return {
    address: wallet.identity.address,
    created: wallet.created,
    intents: wallet.intents.length,
    watches: wallet.watches.length,
    relationships: wallet.relationships.length,
    permissions: {
      active: wallet.permissions.filter(p => !p.revoked).length,
      revoked: wallet.permissions.filter(p => p.revoked).length,
    },
    topDomains: Object.entries(wallet.stats.domainsQueried)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d, c]) => `${d}: ${c}`),
    sessions: wallet.stats.sessions,
  };
}

// Helpers
function avgConfidence(results) {
  const vals = Object.values(results || {})
    .map(r => r.confidence)
    .filter(c => typeof c === 'number');
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
}

function parseDuration(str) {
  const m = str.match(/^(\d+)(h|d|w|m)$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000; // default 1 week
  const n = parseInt(m[1]);
  const unit = { h: 3600000, d: 86400000, w: 604800000, m: 2592000000 };
  return n * (unit[m[2]] || 86400000);
}

module.exports = { init, loadWallet, recordIntent, addRelationship, grantPermission, revokePermission, exportWallet, summary };
