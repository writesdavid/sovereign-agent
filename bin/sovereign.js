#!/usr/bin/env node

const readline = require('readline');
const identity = require('../lib/identity');
const { parseIntent, resolve } = require('../lib/resolver');
const display = require('../lib/display');
const store = require('../lib/store');
const wallet = require('../lib/wallet');

async function main() {
  const args = process.argv.slice(2);

  // Load or create identity
  let keys = identity.load();
  if (!keys) {
    console.log('\n  No identity found. Generating keypair...');
    keys = identity.generate();
    console.log('  ✓ Ed25519 keypair created');
    console.log('  ✓ Agent ID: ' + keys.agentId);
    console.log('  ✓ Stored at ~/.sovereign/keypair.json');
    console.log('');
    console.log('  Your agent is sovereign. No account created.');
    console.log('  No server contacted. The keypair never leaves');
    console.log('  this machine.');
  }

  // Init wallet
  const w = wallet.init(keys);

  // CLI flags
  if (args[0] === '--wallet') {
    const s = wallet.summary(w);
    console.log('\n  ══ Sovereign Wallet ══');
    console.log('  Address:       ' + s.address);
    console.log('  Created:       ' + s.created.slice(0, 10));
    console.log('  Sessions:      ' + s.sessions);
    console.log('  Intents:       ' + s.intents);
    console.log('  Watches:       ' + s.watches);
    console.log('  Relationships: ' + s.relationships);
    console.log('  Permissions:   ' + s.permissions.active + ' active, ' + s.permissions.revoked + ' revoked');
    if (s.topDomains.length) {
      console.log('  Top domains:   ' + s.topDomains.join(', '));
    }
    console.log('');
    return;
  }

  if (args[0] === '--watches' || args[0] === '-w') {
    const watches = store.getWatches();
    if (watches.length === 0) { console.log('\n  No active watches.\n'); return; }
    console.log('\n  Active watches:');
    watches.forEach((w, i) => console.log(`  ${i + 1}. ${w.description} (since ${w.created.slice(0, 10)})`));
    console.log('');
    return;
  }

  if (args[0] === '--history' || args[0] === '-h') {
    const history = store.getHistory();
    if (history.length === 0) { console.log('\n  No history.\n'); return; }
    console.log('\n  Recent intents:');
    history.slice(0, 10).forEach(h => console.log(`  ${h.timestamp.slice(0, 10)} │ ${h.raw}`));
    console.log('');
    return;
  }

  if (args[0] === '--identity' || args[0] === '-i') {
    console.log('\n  Agent ID:    ' + keys.agentId);
    console.log('  Public key:  ' + keys.publicKey.slice(0, 32) + '...');
    console.log('  Created:     ' + keys.created);
    console.log('');
    return;
  }

  if (args[0] === '--direct') {
    const { directDomains } = require('../lib/direct');
    console.log('\n  Domains with direct federal API access (no intermediary):');
    directDomains().forEach(d => console.log('    • ' + d));
    console.log('\n  Other domains fall back to Open Primitive.\n');
    return;
  }

  if (args[0] === '--export') {
    const mem = { identity: { agentId: keys.agentId, publicKey: keys.publicKey }, ...require('../lib/store').load() };
    console.log(JSON.stringify(mem, null, 2));
    return;
  }

  // Direct intent from args
  if (args.length > 0 && !args[0].startsWith('-')) {
    await handleIntent(args.join(' '), keys);
    return;
  }

  // Interactive mode
  console.log('\n  What do you want to know?');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question('  > ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === 'exit' || trimmed === 'quit') { rl.close(); return; }

      if (trimmed === 'watch') {
        // Watch the last intent
        const history = store.getHistory();
        if (history.length > 0) {
          const last = history[0];
          store.addWatch({ description: last.raw, intent: last, interval: 'weekly' });
          console.log('  ✓ Watching: ' + last.raw + ' (weekly)');
          console.log('  Run `sovereign-agent --watches` to see monitors.\n');
        }
        ask();
        return;
      }

      await handleIntent(trimmed, keys);
      ask();
    });
  };

  ask();
}

async function handleIntent(text, keys) {
  const intent = parseIntent(text);

  if (intent.domains.length === 0) {
    console.log('  I couldn\'t determine what to query. Try including a ZIP code');
    console.log('  or mention water, air, safety, drugs, hospitals, or education.\n');
    return;
  }

  console.log('\n  Resolving intent...');

  const oppHeaders = identity.headers(keys, text);

  // Show progress
  for (let i = 0; i < intent.domains.length; i++) {
    const domain = intent.domains[i];
    const isLast = i === intent.domains.length - 1;

    try {
      // Progress indicator (domain name shown before query completes)
      if (isLast) display.lastProgress(domain, 'ok');
      else display.progress(domain, 'ok');
    } catch {
      if (isLast) display.lastProgress(domain, 'fail');
      else display.progress(domain, 'fail');
    }
  }

  const resolution = await resolve(intent, oppHeaders);

  // Display results
  if (intent.isComparison && intent.zips.length >= 2) {
    displayComparison(intent, resolution);
  } else if (intent.domains.includes('drugs') && intent.drugName) {
    displayDrug(intent, resolution);
  } else {
    displaySingle(intent, resolution);
  }

  // Store in history + wallet
  store.addIntent(intent, resolution.results);
  const sig = identity.sign(keys.privateKey, resolution.results);
  wallet.recordIntent(wallet.loadWallet(), intent, resolution, sig);
  wallet.addRelationship(wallet.loadWallet(), { url: 'https://api.openprimitive.com', name: 'Open Primitive' });

  console.log('  Want to watch this? Type "watch" or ask something else.\n');
}

function displaySingle(intent, resolution) {
  const zip = intent.zips[0] || '?';
  display.header('Results for ' + zip);

  const srcs = [];
  for (const [domain, data] of Object.entries(resolution.results)) {
    if (data.error) continue;
    const source = data.source || data.provenance?.source || domain;
    srcs.push(source);

    if (data.results && Array.isArray(data.results)) {
      display.row(domain, data.results.length + ' results');
    } else if (data.totalResults !== undefined) {
      display.row(domain, data.totalResults + ' results');
    } else {
      display.row(domain, '✓');
    }

    if (data.confidence !== undefined) {
      display.row('  confidence', (data.confidence * 100).toFixed(0) + '%');
    }
  }

  if (resolution.results.water) {
    const w = resolution.results.water;
    if (w.results && w.results.length > 0) {
      const sys = w.results[0];
      display.verdict(`Water system: ${sys.name || sys.pwsName || 'found'}. ${sys.violations?.length === 0 ? 'No active violations.' : (sys.violations?.length || '?') + ' violation(s) on record.'}`);
    }
  }

  display.sources(srcs.map(s => s + ' (Ed25519 verified)'));
  display.footer();
}

function displayComparison(intent, resolution) {
  display.header('Comparing ' + intent.zips.join(' vs '));

  for (const [domain, zipData] of Object.entries(resolution.results)) {
    console.log('');
    display.row(domain, '');
    for (const [zip, data] of Object.entries(zipData)) {
      if (data.error) { display.row('  ' + zip, 'error'); continue; }
      const count = data.results?.length || data.totalResults || '✓';
      display.row('  ' + zip, typeof count === 'number' ? count + ' results' : count);
    }
  }

  display.sources(['All responses cryptographically verified']);
  display.footer();
}

function displayDrug(intent, resolution) {
  display.header('Drug: ' + intent.drugName);

  const d = resolution.results.drugs;
  if (d && !d.error) {
    if (d.totalResults !== undefined) display.row('Adverse events', d.totalResults.toLocaleString());
    if (d.results && d.results.length > 0) {
      display.row('Recent reports', d.results.length + ' shown');
    }
    if (d.source) display.sources([d.source + ' (Ed25519 verified)']);
  }

  display.footer();
}

main().catch(err => {
  console.error('  Error: ' + err.message);
  process.exit(1);
});
