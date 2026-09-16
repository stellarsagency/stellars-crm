const https = require('https');

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'StellarsCRM/2.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'StellarsCRM/2.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(20000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

const NICHE_KEYWORDS = {
  'Pest Control': ['pest control', 'exterminator', 'pest management', 'termite', 'bug'],
  'Auto Detailing': ['auto detail', 'car detail', 'car wash'],
  'Painting': ['painting', 'painters', 'paint contractor'],
  'Fence': ['fence', 'fencing'],
  'Landscaping': ['landscaping', 'lawn care', 'lawn service'],
  'Pressure Washing': ['pressure wash', 'power wash'],
  'Cleaning': ['cleaning service', 'janitorial', 'house clean'],
  'Pool Service': ['pool service', 'pool clean', 'swimming pool'],
  'Handyman': ['handyman', 'home repair'],
  'Tattoo': ['tattoo'],
  'Concrete': ['concrete'],
};

const CITY_COORDS = {
  'Houston': [29.76, -95.37], 'Dallas': [32.78, -96.80], 'San Antonio': [29.42, -98.49],
  'Austin': [30.27, -97.74], 'Fort Worth': [32.73, -97.33], 'El Paso': [31.76, -106.44],
  'Atlanta': [33.75, -84.39], 'Savannah': [32.08, -81.09], 'Augusta': [33.47, -81.97],
  'Miami': [25.76, -80.19], 'Tampa': [27.95, -82.46], 'Orlando': [28.54, -81.38],
  'Jacksonville': [30.33, -81.66], 'New York': [40.71, -74.01], 'Buffalo': [42.89, -78.88],
  'Phoenix': [33.45, -112.07], 'Tucson': [32.22, -110.97], 'Charlotte': [35.23, -80.84],
  'Raleigh': [35.78, -78.64], 'Nashville': [36.16, -86.78], 'Knoxville': [35.96, -83.92],
  'Los Angeles': [34.05, -118.24], 'San Diego': [32.72, -117.16], 'Las Vegas': [36.17, -115.14],
  'Chicago': [41.88, -87.63], 'Columbus': [39.96, -82.99], 'Cleveland': [41.50, -81.69],
  'Indianapolis': [39.77, -86.16], 'Seattle': [47.61, -122.33], 'Portland': [45.52, -122.68],
  'Denver': [39.74, -104.99], 'Kansas City': [39.10, -94.58], 'Oklahoma City': [35.47, -97.52],
  'Birmingham': [33.52, -86.81], 'Louisville': [38.25, -85.76], 'Memphis': [35.15, -90.05],
  'New Orleans': [29.95, -90.07], 'Pittsburgh': [40.44, -79.99], 'Philadelphia': [39.95, -75.17],
  'Baltimore': [39.29, -76.61], 'Richmond': [37.54, -77.43], 'Cincinnati': [39.10, -84.51],
  'Corpus Christi': [27.80, -97.40], 'Arlington': [32.74, -97.11], 'Plano': [33.02, -96.70],
  'McKinney': [33.20, -96.62], 'Frisco': [33.15, -96.82], 'Lubbock': [33.58, -101.85],
  'Laredo': [27.50, -99.50], 'Irving': [32.81, -96.96], 'Garland': [32.91, -96.64],
  'Amarillo': [35.22, -101.83], 'Grand Prairie': [32.75, -97.02], 'Brownsville': [25.90, -97.50],
  'Pasadena': [29.70, -95.13], 'Mesquite': [32.77, -96.60],
  'Katy': [29.79, -95.82], 'Sugar Land': [29.62, -95.63], 'Pearland': [29.56, -95.29],
};

const OVERPASS = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';

function getBBox(lat, lon, rkm = 20) {
  const d = rkm / 111;
  return [(lat-d).toFixed(4), (lon-d).toFixed(4), (lat+d).toFixed(4), (lon+d).toFixed(4)];
}

async function searchOverpass(keywords, lat, lon, limit = 50) {
  const leads = [];
  const seen = new Set();
  const bbox = getBBox(lat, lon);

  // Search by name regex for each keyword
  for (const kw of keywords) {
    if (leads.length >= limit) break;
    try {
      const query = `[out:json][timeout:20];node["name"~"${kw}",i](${bbox.join(',')});out body;`;
      const body = `data=${encodeURIComponent(query)}`;
      const raw = await httpPost(OVERPASS, body);
      const data = JSON.parse(raw);
      if (!data.elements) continue;

      for (const el of data.elements) {
        if (leads.length >= limit) break;
        if (seen.has(el.id)) continue;
        seen.add(el.id);
        const name = el.tags?.name;
        if (!name || name.length < 3) continue;

        const website = el.tags?.website || el.tags?.['contact:website'] || null;
        const phone = el.tags?.phone || el.tags?.['contact:phone'] || null;
        const street = el.tags?.['addr:street'] || '';
        const housenum = el.tags?.['addr:housenumber'] || '';
        const city = el.tags?.['addr:city'] || '';
        const state = el.tags?.['addr:state'] || '';
        const addr = [housenum, street].filter(Boolean).join(' ');

        leads.push({
          business_name: name, phone, website,
          address: addr || null,
          city: city || null, state: state || null,
          latitude: el.lat, longitude: el.lon,
          has_website: !!website,
          source: 'openstreetmap',
          website_analysis: website ? { is_outdated: false, has_mobile: true, has_ssl: website.startsWith('https') } : null,
        });
      }
    } catch(e) { /* skip */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  return leads;
}

async function searchNominatim(keywords, cityName, stateCode, limit = 20) {
  const leads = [];
  const seen = new Set();

  for (const kw of keywords) {
    if (leads.length >= limit) break;
    try {
      const q = encodeURIComponent(`${kw} ${cityName} ${stateCode}`);
      const raw = await httpGet(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=10&addressdetails=1&extratags=1`);
      const results = JSON.parse(raw);

      for (const r of results) {
        if (leads.length >= limit) break;
        const name = r.display_name?.split(',')[0]?.trim();
        if (!name || name.length < 3 || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());

        const phone = r.extrats?.phone || r.extrats?.['contact:phone'] || null;
        const website = r.extrats?.website || r.extrats?.['contact:website'] || null;

        leads.push({
          business_name: name, phone, website,
          address: null,
          city: r.address?.city || r.address?.town || cityName,
          state: r.address?.state || stateCode || '',
          latitude: parseFloat(r.lat) || null,
          longitude: parseFloat(r.lon) || null,
          has_website: !!website,
          source: 'openstreetmap',
          website_analysis: website ? { is_outdated: false, has_mobile: true, has_ssl: website.startsWith('https') } : null,
        });
      }
    } catch(e) { /* skip */ }
    await new Promise(r => setTimeout(r, 1200));
  }
  return leads;
}

async function scrapeGoogleMaps(niche, location, maxResults = 30) {
  const keywords = NICHE_KEYWORDS[niche] || [niche.toLowerCase()];
  const cityName = location.split(',')[0]?.trim() || location;
  const stateCode = location.split(',')[1]?.trim() || '';
  const coords = CITY_COORDS[cityName];
  const leads = [];
  const seen = new Set();

  console.log(`  Searching: ${keywords.join(', ')} in ${cityName}, ${stateCode}`);

  // Method 1: Overpass by name (has lat/lon)
  if (coords) {
    console.log(`  Overpass search (${coords[0]}, ${coords[1]})...`);
    const overpassLeads = await searchOverpass(keywords, coords[0], coords[1], maxResults);
    for (const l of overpassLeads) {
      const key = l.business_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) { seen.add(key); leads.push(l); }
    }
    console.log(`  Overpass: ${overpassLeads.length} results`);
  }

  // Method 2: Nominatim search (backup)
  if (leads.length < maxResults) {
    console.log(`  Nominatim search...`);
    const nomLeads = await searchNominatim(keywords, cityName, stateCode, maxResults - leads.length);
    for (const l of nomLeads) {
      const key = l.business_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) { seen.add(key); leads.push(l); }
    }
    console.log(`  Nominatim: ${nomLeads.length} results`);
  }

  // Set niche on all leads
  for (const l of leads) l.niche = niche;

  console.log(`  Total: ${leads.length} leads for "${niche} in ${cityName}, ${stateCode}"`);
  return leads.slice(0, maxResults);
}

module.exports = { scrapeGoogleMaps };
