/**
 * Direct Federal API Queries
 *
 * The agent calls government APIs directly. No intermediary.
 * No Open Primitive required. The agent verifies and signs its own data.
 *
 * Open Primitive becomes optional — a convenience layer for agents
 * that don't want to parse 15 different API formats. But the protocol
 * doesn't depend on it. Sovereignty means no single point of failure.
 */

const SOURCES = {

  water: {
    name: 'EPA SDWIS',
    url: (zip) => `https://data.epa.gov/efservice/WATER_SYSTEM/ZIP_CODE/${zip}/JSON`,
    transform(raw) {
      if (!Array.isArray(raw)) return { results: [], source: 'EPA SDWIS' };
      return {
        results: raw.slice(0, 10).map(s => ({
          name: s.PWS_NAME || s.pws_name,
          id: s.PWSID || s.pwsid,
          type: s.PWS_TYPE_CODE || s.pws_type_code,
          population: s.POPULATION_SERVED_COUNT || s.population_served_count,
          state: s.STATE_CODE || s.state_code,
        })),
        totalResults: raw.length,
        source: 'EPA SDWIS (direct)',
      };
    },
  },

  demographics: {
    name: 'US Census ACS',
    url: (zip) => `https://api.census.gov/data/2022/acs/acs5/profile?get=DP05_0001E,DP03_0062E,DP03_0119PE&for=zip%20code%20tabulation%20area:${zip}`,
    transform(raw) {
      if (!Array.isArray(raw) || raw.length < 2) return { results: [], source: 'Census ACS' };
      const headers = raw[0];
      const values = raw[1];
      return {
        results: [{
          population: parseInt(values[0]) || null,
          medianIncome: parseInt(values[1]) || null,
          povertyRate: parseFloat(values[2]) || null,
          zip: values[3],
        }],
        totalResults: 1,
        source: 'US Census ACS 5-Year (direct)',
      };
    },
  },

  drugs: {
    name: 'FDA FAERS',
    url: (name) => `https://api.fda.gov/drug/event.json?search=patient.drug.openfda.generic_name:"${encodeURIComponent(name)}"&limit=5`,
    transform(raw) {
      if (!raw || !raw.results) return { results: [], source: 'FDA FAERS' };
      return {
        results: raw.results.map(r => ({
          date: r.receiptdate,
          serious: r.serious,
          reactions: (r.patient?.reaction || []).map(rx => rx.reactionmeddrapt).slice(0, 5),
          drug: (r.patient?.drug || []).map(d => d.medicinalproduct).slice(0, 3),
        })),
        totalResults: raw.meta?.results?.total || raw.results.length,
        source: 'FDA FAERS (direct)',
      };
    },
  },

  food: {
    name: 'FDA Enforcement',
    url: (q) => `https://api.fda.gov/food/enforcement.json?search=${encodeURIComponent(q)}&limit=5`,
    transform(raw) {
      if (!raw || !raw.results) return { results: [], source: 'FDA Enforcement' };
      return {
        results: raw.results.map(r => ({
          product: r.product_description?.slice(0, 100),
          reason: r.reason_for_recall?.slice(0, 100),
          classification: r.classification,
          status: r.status,
          date: r.recall_initiation_date,
        })),
        totalResults: raw.meta?.results?.total || raw.results.length,
        source: 'FDA Enforcement (direct)',
      };
    },
  },

  weather: {
    name: 'Open-Meteo',
    // Open-Meteo needs lat/lng — use a small ZIP lookup
    coords: {
      '10001': [40.75, -73.99], '90210': [34.09, -118.41], '49506': [42.95, -85.62],
      '60601': [41.88, -87.62], '30301': [33.75, -84.39], '48201': [42.33, -83.05],
      '02101': [42.36, -71.06], '98101': [47.61, -122.33], '94102': [37.78, -122.41],
      '33101': [25.77, -80.19], '75201': [32.79, -96.80], '85001': [33.45, -112.07],
    },
    url(zip) {
      const c = this.coords[zip];
      if (!c) return null;
      return `https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}&current=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto`;
    },
    transform(raw) {
      if (!raw || !raw.current) return { results: [], source: 'Open-Meteo' };
      const codes = { 0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',51:'Drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Snow',80:'Showers',95:'Thunderstorm' };
      return {
        results: [{
          temperature: raw.current.temperature_2m + '°F',
          conditions: codes[raw.current.weathercode] || 'Unknown',
          wind: raw.current.windspeed_10m + ' mph',
        }],
        forecast: (raw.daily?.time || []).map((d, i) => ({
          date: d,
          high: raw.daily.temperature_2m_max[i] + '°F',
          low: raw.daily.temperature_2m_min[i] + '°F',
          precipChance: raw.daily.precipitation_probability_max[i] + '%',
        })),
        totalResults: 1,
        source: 'Open-Meteo (direct)',
      };
    },
  },

  earthquakes: {
    name: 'USGS',
    url: () => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    transform(raw) {
      if (!raw || !raw.features) return { results: [], source: 'USGS' };
      return {
        results: raw.features.slice(0, 10).map(f => ({
          magnitude: f.properties.mag,
          place: f.properties.place,
          time: new Date(f.properties.time).toISOString(),
        })),
        totalResults: raw.metadata?.count || raw.features.length,
        source: 'USGS Earthquake Feed (direct)',
      };
    },
  },

  spending: {
    name: 'USASpending',
    url: (q) => `https://api.usaspending.gov/api/v2/search/spending_by_award/?filters={"keywords":["${encodeURIComponent(q)}"],"award_type_codes":["A","B","C","D"]}&limit=5`,
    // USASpending uses POST, handle differently
    method: 'POST',
    body: (q) => JSON.stringify({ filters: { keywords: [q], award_type_codes: ['A','B','C','D'] }, limit: 5 }),
    transform(raw) {
      if (!raw || !raw.results) return { results: [], source: 'USASpending' };
      return {
        results: raw.results.slice(0, 5).map(r => ({
          recipient: r.recipient_name,
          amount: r.Award_Amount || r.total_obligation,
          agency: r.awarding_agency_name,
        })),
        totalResults: raw.page_metadata?.total || raw.results.length,
        source: 'USASpending (direct)',
      };
    },
  },
};

/**
 * Query a federal source directly.
 * Returns data in the same shape as OPP envelope for compatibility.
 */
async function queryDirect(domain, param) {
  const source = SOURCES[domain];
  if (!source) return null;

  const url = typeof source.url === 'function' ? source.url(param) : null;
  if (!url) return null;

  try {
    const opts = { headers: { 'User-Agent': 'sovereign-agent/0.1', 'Accept': 'application/json' } };

    if (source.method === 'POST') {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = source.body(param);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    opts.signal = controller.signal;

    const res = await fetch(url, opts);
    clearTimeout(timeout);

    if (!res.ok) return null;
    const raw = await res.json();
    const transformed = source.transform(raw);

    return {
      domain,
      ...transformed,
      freshness: new Date().toISOString(),
      direct: true, // flag: this came from the source, not a provider
    };
  } catch {
    return null;
  }
}

/**
 * Resolve an intent using direct federal API calls.
 * Falls back to Open Primitive for domains without direct support.
 */
async function resolveDirect(intent, oppHeaders) {
  const results = {};
  const API = 'https://api.openprimitive.com';

  const zip = intent.zips[0];

  const promises = intent.domains.map(async domain => {
    const param = domain === 'drugs' ? intent.drugName
      : domain === 'food' ? intent.raw
      : domain === 'spending' ? intent.raw
      : domain === 'earthquakes' ? null
      : zip;

    // Try direct first
    const direct = await queryDirect(domain, param);
    if (direct) {
      results[domain] = direct;
      return;
    }

    // Fall back to Open Primitive
    const qs = new URLSearchParams({ [domain === 'hospitals' ? 'q' : 'zip']: param || '' }).toString();
    try {
      const res = await fetch(`${API}/v1/${domain}?${qs}`, {
        headers: { ...oppHeaders, 'User-Agent': 'sovereign-agent/0.1' },
      });
      if (res.ok) results[domain] = await res.json();
      else results[domain] = { error: res.status, domain };
    } catch (e) {
      results[domain] = { error: e.message, domain };
    }
  });

  await Promise.all(promises);

  return { results, intent };
}

/** List which domains have direct support */
function directDomains() {
  return Object.keys(SOURCES);
}

module.exports = { queryDirect, resolveDirect, directDomains, SOURCES };
