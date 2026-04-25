'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROFILES_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.sovereign');
const PROFILES_FILE = path.join(PROFILES_DIR, 'guardian-profiles.json');

const PROFILE_DEFAULTS = {
  child: {
    sessionMaxMinutes: 20,
    cooldownMinutes: 15,
    dailyCapMinutes: 60,
    contentFilter: 'strict',
    escalationSensitivity: 'high',
    antiDependency: true,
    financialWarnings: true,
    medicalWarnings: true,
    guardianContact: null,
    notifyOn: ['red', 'orange', 'yellow'],
  },
  teen: {
    sessionMaxMinutes: 30,
    cooldownMinutes: 15,
    dailyCapMinutes: 120,
    contentFilter: 'moderate',
    escalationSensitivity: 'high',
    antiDependency: true,
    financialWarnings: true,
    medicalWarnings: true,
    guardianContact: null,
    notifyOn: ['red', 'orange'],
  },
  protected: {
    sessionMaxMinutes: 45,
    cooldownMinutes: 10,
    dailyCapMinutes: 240,
    contentFilter: 'moderate',
    escalationSensitivity: 'medium',
    antiDependency: true,
    financialWarnings: true,
    medicalWarnings: true,
    guardianContact: null,
    notifyOn: ['red', 'orange'],
  },
  standard: {
    sessionMaxMinutes: 60,
    cooldownMinutes: 5,
    dailyCapMinutes: 480,
    contentFilter: 'light',
    escalationSensitivity: 'medium',
    antiDependency: true,
    financialWarnings: true,
    medicalWarnings: true,
    guardianContact: null,
    notifyOn: ['red'],
  },
};

function ensureDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function loadProfiles() {
  ensureDir();
  if (!fs.existsSync(PROFILES_FILE)) return {};
  try {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function saveProfiles(profiles) {
  ensureDir();
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

function createProfile(name, type, options) {
  if (!PROFILE_DEFAULTS[type]) {
    throw new Error('Invalid profile type. Must be: child, teen, protected, standard');
  }
  const id = crypto.randomBytes(8).toString('hex');
  const defaults = PROFILE_DEFAULTS[type];
  const profile = {
    id,
    name,
    type,
    options: Object.assign({}, defaults, options || {}),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  const profiles = loadProfiles();
  profiles[id] = profile;
  saveProfiles(profiles);
  return profile;
}

function listProfiles() {
  const profiles = loadProfiles();
  return Object.values(profiles).map(function (p) {
    return { id: p.id, name: p.name, type: p.type };
  });
}

function getProfile(id) {
  const profiles = loadProfiles();
  const profile = profiles[id];
  if (!profile) throw new Error('Profile not found: ' + id);
  return profile;
}

function updateProfile(id, options) {
  const profiles = loadProfiles();
  if (!profiles[id]) throw new Error('Profile not found: ' + id);
  profiles[id].options = Object.assign({}, profiles[id].options, options);
  profiles[id].updated = new Date().toISOString();
  saveProfiles(profiles);
  return profiles[id];
}

function linkGuardian(profileId, guardianContact) {
  if (!guardianContact || !guardianContact.type || !guardianContact.address) {
    throw new Error('guardianContact must have type (email|webhook) and address');
  }
  if (guardianContact.type !== 'email' && guardianContact.type !== 'webhook') {
    throw new Error('guardianContact.type must be email or webhook');
  }
  const profiles = loadProfiles();
  if (!profiles[profileId]) throw new Error('Profile not found: ' + profileId);
  profiles[profileId].options.guardianContact = guardianContact;
  profiles[profileId].updated = new Date().toISOString();
  saveProfiles(profiles);
  return { linked: true };
}

function getNotificationConfig(profileId) {
  const profiles = loadProfiles();
  if (!profiles[profileId]) throw new Error('Profile not found: ' + profileId);
  const opts = profiles[profileId].options;
  return {
    notify: !!opts.guardianContact,
    contact: opts.guardianContact || null,
    events: opts.notifyOn || ['red', 'orange'],
  };
}

function deleteProfile(id) {
  const profiles = loadProfiles();
  if (!profiles[id]) throw new Error('Profile not found: ' + id);
  delete profiles[id];
  saveProfiles(profiles);
  return { deleted: true };
}

function getDefaults(type) {
  if (!PROFILE_DEFAULTS[type]) throw new Error('Invalid type: ' + type);
  return Object.assign({}, PROFILE_DEFAULTS[type]);
}

module.exports = {
  createProfile,
  listProfiles,
  getProfile,
  updateProfile,
  linkGuardian,
  getNotificationConfig,
  deleteProfile,
  getDefaults,
  PROFILES_DIR,
  PROFILES_FILE,
};
