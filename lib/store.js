const fs = require('fs');
const path = require('path');
const { DIR } = require('./identity');

const MEM_FILE = path.join(DIR, 'memory.json');

function load() {
  if (!fs.existsSync(MEM_FILE)) return { intents: [], watches: [], preferences: {} };
  try { return JSON.parse(fs.readFileSync(MEM_FILE, 'utf8')); }
  catch { return { intents: [], watches: [], preferences: {} }; }
}

function save(data) {
  fs.writeFileSync(MEM_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function addIntent(intent, resolution) {
  const mem = load();
  mem.intents.unshift({ ...intent, resolution, timestamp: new Date().toISOString() });
  if (mem.intents.length > 100) mem.intents = mem.intents.slice(0, 100);
  save(mem);
}

function addWatch(watch) {
  const mem = load();
  mem.watches.push({ ...watch, created: new Date().toISOString(), lastChecked: null });
  save(mem);
}

function getWatches() { return load().watches; }
function getHistory() { return load().intents; }

function removeWatch(index) {
  const mem = load();
  mem.watches.splice(index, 1);
  save(mem);
}

module.exports = { addIntent, addWatch, getWatches, getHistory, removeWatch };
