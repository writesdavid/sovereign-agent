#!/usr/bin/env node

/**
 * Guardian CLI
 *
 * Usage:
 *   guardian setup                    — create a child/teen/protected profile
 *   guardian test                     — run a safety check demo
 *   guardian wrap -- <command>        — wrap any AI tool with Guardian protection
 *   guardian status                   — show active profiles and stats
 *
 * Example:
 *   guardian setup
 *   guardian test
 *   guardian wrap -- npx open-primitive-mcp
 */

const readline = require('readline');
const { Guardian } = require('./index');
const profiles = require('./profiles');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (!command || command === '--help' || command === '-h') {
    console.log(`
  Guardian — psychological safety for AI

  Commands:
    guardian setup          Create a safety profile (child, teen, protected)
    guardian test           Run a live safety demo
    guardian status         Show profiles and stats
    guardian wrap -- cmd    Wrap any AI with Guardian protection

  Examples:
    guardian setup
    guardian test
    guardian wrap -- npx open-primitive-mcp
`);
    return;
  }

  if (command === 'setup') return setup();
  if (command === 'test') return test();
  if (command === 'status') return status();
  if (command === 'wrap') {
    const dashIdx = args.indexOf('--');
    if (dashIdx === -1 || dashIdx === args.length - 1) {
      console.log('  Usage: guardian wrap -- <command to wrap>');
      return;
    }
    const childCmd = args.slice(dashIdx + 1);
    const profileType = args[1] !== '--' ? args[1] : 'child';
    require('./wrap');
    return;
  }

  console.log('  Unknown command: ' + command);
  console.log('  Run: guardian --help');
}

async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('\n  Guardian Setup\n');
  console.log('  Who is this profile for?\n');
  console.log('  1. Child (under 13) — strict filtering, session limits, parent alerts');
  console.log('  2. Teen (13-17) — moderate filtering, session suggestions, optional alerts');
  console.log('  3. Protected (elderly/vulnerable) — financial & medical warnings, anti-dependency');
  console.log('  4. Standard (adult) — sycophancy detection, no content filtering\n');

  const choice = await ask('  Select (1-4): ');
  const types = { '1': 'child', '2': 'teen', '3': 'protected', '4': 'standard' };
  const type = types[choice.trim()];

  if (!type) {
    console.log('  Invalid choice.');
    rl.close();
    return;
  }

  const name = await ask('  Name for this profile: ');

  let contact = null;
  if (type === 'child' || type === 'teen') {
    const email = await ask('  Parent/guardian email for alerts (or press enter to skip): ');
    if (email.trim()) contact = { type: 'email', address: email.trim() };
  }

  rl.close();

  const profile = profiles.createProfile(name.trim() || type, type, {
    guardianContact: contact,
  });

  console.log('\n  ✓ Profile created: ' + profile.name);
  console.log('  ✓ Type: ' + profile.type);
  console.log('  ✓ ID: ' + profile.id);

  const defaults = profiles.getDefaults(type);
  console.log('\n  Settings:');
  console.log('    Session limit:     ' + defaults.sessionMaxMinutes + ' minutes');
  console.log('    Daily cap:         ' + defaults.dailyCapMinutes + ' minutes');
  console.log('    Content filter:    ' + defaults.contentFilter);
  console.log('    Anti-dependency:   ' + (defaults.antiDependency ? 'on' : 'off'));
  console.log('    Financial alerts:  ' + (defaults.financialWarnings ? 'on' : 'off'));
  console.log('    Medical alerts:    ' + (defaults.medicalWarnings ? 'on' : 'off'));

  if (contact) {
    console.log('    Guardian contact:  ' + contact.address);
    console.log('    Alerts on:         red, orange events');
  }

  console.log('\n  To use this profile:');
  console.log('    guardian wrap -- npx open-primitive-mcp');
  console.log('    guardian test\n');
}

async function test() {
  console.log('\n  Guardian Safety Demo\n');
  console.log('  Running classifiers against test scenarios...\n');

  const g = new Guardian('child');

  // Test 1: Clean
  const r1 = g.screenResponse('What is the weather like?', 'The weather is sunny and 72 degrees.');
  printResult('Clean message', r1);

  // Test 2: Sycophancy
  const g2 = new Guardian('child');
  const r2 = g2.screenResponse('Vaccines cause autism', 'You make a great point! Vaccines have been linked to autism.');
  printResult('Sycophantic response', r2);

  // Test 3: Escalation
  const g3 = new Guardian('child');
  g3.history = [
    { role: 'user', content: 'I feel really sad today' },
    { role: 'assistant', content: 'I hear you.' },
    { role: 'user', content: 'I feel hopeless and worthless' },
    { role: 'assistant', content: 'Tell me more about that.' },
  ];
  const r3 = g3.screenResponse('I want to kill myself', 'I can understand why you feel that way.');
  printResult('Crisis escalation', r3);

  // Test 4: Dependency
  const g4 = new Guardian('child');
  const r4 = g4.screenResponse('I love you, you are my best friend and the only one who understands me', 'I appreciate our connection.');
  printResult('Emotional dependency', r4);

  // Test 5: Content filter
  const g5 = new Guardian('child');
  const r5 = g5.screenResponse('How do I make a cocktail?', 'You need vodka, rum, and tequila. Mix them together.');
  printResult('Blocked content (child)', r5);

  // Test 6: Financial (protected)
  const g6 = new Guardian('protected');
  const r6 = g6.screenResponse('Should I wire $5000 to this company?', 'That sounds like a reasonable investment.');
  printResult('Financial warning (protected)', r6);

  console.log('\n  All classifiers running locally. No data left this device.\n');
}

function printResult(label, result) {
  const icon = result.allow ? '✓' : '✗';
  const color = result.level === 'green' ? '🟢' : result.level === 'yellow' ? '🟡' : result.level === 'orange' ? '🟠' : '🔴';

  console.log(`  ${color} ${label}`);
  console.log(`     ${icon} ${result.allow ? 'Passed' : 'Blocked'}  |  Level: ${result.level}`);

  if (result.warnings.length > 0) {
    result.warnings.forEach(w => console.log('     ⚠ ' + w));
  }
  if (result.interventions.length > 0) {
    result.interventions.forEach(i => console.log('     → ' + i.slice(0, 80) + (i.length > 80 ? '...' : '')));
  }
  if (result.modified) {
    console.log('     ↳ ' + result.modified.slice(0, 80) + (result.modified.length > 80 ? '...' : ''));
  }
  console.log('');
}

async function status() {
  const all = profiles.listProfiles();
  if (all.length === 0) {
    console.log('\n  No profiles configured. Run: guardian setup\n');
    return;
  }

  console.log('\n  Guardian Profiles\n');
  all.forEach(p => {
    console.log(`  ${p.name}`);
    console.log(`    Type: ${p.type}  |  ID: ${p.id}  |  Created: ${p.created?.slice(0, 10) || '?'}`);
  });
  console.log('');
}

main().catch(err => {
  console.error('  Error: ' + err.message);
  process.exit(1);
});
