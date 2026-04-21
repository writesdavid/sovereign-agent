const DOMAINS = {
  water: { keywords: ['water', 'drinking', 'tap', 'contaminant', 'safe to drink'], param: 'zip' },
  air: { keywords: ['air', 'aqi', 'pollution', 'breathe', 'air quality'], param: 'zip' },
  weather: { keywords: ['weather', 'forecast', 'rain', 'temperature', 'storm'], param: 'zip' },
  drugs: { keywords: ['drug', 'medication', 'adverse', 'side effect', 'prescription'], param: 'name' },
  hospitals: { keywords: ['hospital', 'medical', 'emergency', 'healthcare'], param: 'q' },
  food: { keywords: ['food', 'recall', 'contamination', 'fda'], param: 'q' },
  demographics: { keywords: ['population', 'income', 'poverty', 'demographics', 'neighborhood', 'census'], param: 'zip' },
  safety: { keywords: ['safety', 'safe', 'crime', 'danger'], param: 'zip' },
  education: { keywords: ['school', 'college', 'university', 'education'], param: 'name' },
  jobs: { keywords: ['jobs', 'unemployment', 'employment', 'labor'], param: 'series' },
};

function extractZips(text) {
  const m = text.match(/\b\d{5}\b/g);
  return m || [];
}

function extractDrugName(text) {
  const lower = text.toLowerCase();
  const skip = ['is', 'my', 'the', 'for', 'new', 'any', 'how', 'what', 'safe', 'watch', 'drug', 'adverse', 'events', 'effects', 'side'];
  const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !skip.includes(w));
  // Return the longest word that isn't a common English word — likely the drug name
  return words.sort((a, b) => b.length - a.length)[0] || null;
}

function parseIntent(text) {
  const lower = text.toLowerCase();
  const matched = [];

  for (const [domain, config] of Object.entries(DOMAINS)) {
    if (config.keywords.some(k => lower.includes(k))) {
      matched.push(domain);
    }
  }

  const zips = extractZips(text);
  const isComparison = zips.length >= 2 || lower.includes('compare') || lower.includes('vs');

  // Default to safety + demographics + water + air + hospitals for neighborhood/compare queries
  if (isComparison && matched.length === 0) {
    matched.push('demographics', 'safety', 'water', 'hospitals');
  }

  // If nothing matched but we have a ZIP, do a location profile
  if (matched.length === 0 && zips.length > 0) {
    matched.push('water', 'air', 'demographics', 'safety');
  }

  // Drug watch
  if (lower.includes('watch') && (lower.includes('drug') || lower.includes('medication'))) {
    matched.push('drugs');
  }

  return {
    raw: text,
    domains: [...new Set(matched)],
    zips,
    isComparison,
    drugName: matched.includes('drugs') ? extractDrugName(text) : null,
  };
}

const { queryDirect } = require('./direct');
const API = 'https://api.openprimitive.com';

async function query(domain, params, oppHeaders) {
  // Try direct federal API first — no intermediary
  const paramVal = params.zip || params.q || params.name || Object.values(params)[0];
  if (paramVal) {
    const direct = await queryDirect(domain, paramVal);
    if (direct && !direct.error) return direct;
  }

  // Fall back to Open Primitive
  const qs = new URLSearchParams(params).toString();
  const url = `${API}/v1/${domain}?${qs}`;
  const res = await fetch(url, { headers: { ...oppHeaders, 'User-Agent': 'sovereign-agent/0.1' } });
  if (!res.ok) return { error: res.status, domain };
  return res.json();
}

async function resolve(intent, oppHeaders) {
  const results = {};
  const errors = [];

  if (intent.isComparison && intent.zips.length >= 2) {
    // Compare mode: query each domain for each ZIP
    for (const domain of intent.domains) {
      results[domain] = {};
      const promises = intent.zips.map(async zip => {
        const param = DOMAINS[domain]?.param || 'zip';
        const data = await query(domain, { [param]: zip }, oppHeaders);
        results[domain][zip] = data;
      });
      await Promise.all(promises);
    }
  } else if (intent.domains.includes('drugs') && intent.drugName) {
    results.drugs = await query('drugs', { name: intent.drugName }, oppHeaders);
  } else {
    const zip = intent.zips[0];
    const promises = intent.domains.map(async domain => {
      const param = DOMAINS[domain]?.param || 'q';
      const val = param === 'zip' ? zip : intent.raw;
      if (!val) { errors.push(domain); return; }
      results[domain] = await query(domain, { [param]: val }, oppHeaders);
    });
    await Promise.all(promises);
  }

  return { results, errors, intent };
}

module.exports = { parseIntent, resolve, DOMAINS };
