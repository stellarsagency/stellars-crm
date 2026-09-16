const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'StellarsCRM/2.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(30000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

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

const NICHE_OSM = {
  'Pest Control': ['shop=pest_control', 'amenity=pest_control'],
  'Auto Detailing': ['shop=car_repair', 'shop=car'],
  'Painting': ['craft=painter', 'shop=paint'],
  'Fence': ['craft=fence'],
  'Landscaping': ['amenity=garden_centre', 'shop=garden_centre', 'landuse=allotments'],
  'Pressure Washing': ['craft=cleaning'],
  'Cleaning': ['shop=cleaning'],
  'Pool Service': ['leisure=swimming_pool'],
  'Handyman': ['craft=handicraft'],
  'Tattoo': ['shop=tattoo'],
  'Concrete': ['craft=concrete'],
};

const OVERPASS_MIRROR = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';

function getBounding(lat, lon, radiusMeters = 25000) {
  const dLat = radiusMeters / 111320;
  const dLon = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  return {
    south: (lat - dLat).toFixed(4),
    west: (lon - dLon).toFixed(4),
    north: (lat + dLat).toFixed(4),
    east: (lon + dLon).toFixed(4)
  };
}

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
  'Chattanooga': [35.05, -85.31], 'Arlington': [32.74, -97.11], 'Plano': [33.02, -96.70],
  'McKinney': [33.20, -96.62], 'Frisco': [33.15, -96.82], 'Lubbock': [33.58, -101.85],
  'Laredo': [27.50, -99.50], 'Irving': [32.81, -96.96], 'Garland': [32.91, -96.64],
  'Amarillo': [35.22, -101.83], 'Grand Prairie': [32.75, -97.02], 'Brownsville': [25.90, -97.50],
  'Pasadena': [29.70, -95.13], 'Mesquite': [32.77, -96.60], 'Corpus Christi': [27.80, -97.40], 'Aurora': [41.76, -88.32],
  'Rochester': [43.16, -77.61], 'Yonkers': [40.93, -73.90], 'Mesa': [33.42, -111.83],
  'Chandler': [33.30, -111.84], 'Scottsdale': [33.49, -111.93], 'Gilbert': [33.35, -111.79],
  'Glendale': [33.54, -112.19], 'Tempe': [33.43, -111.94], 'Peoria': [33.58, -112.24],
  'Surprise': [33.63, -112.37], 'Greensboro': [36.07, -79.79], 'Winston-Salem': [36.10, -80.24],
  'Durham': [35.99, -78.90], 'Fayetteville': [35.05, -78.88], 'Cary': [35.79, -78.78],
  'Wilmington': [34.23, -77.94], 'High Point': [35.96, -80.00], 'Greenville': [35.61, -77.37],
  'Murfreesboro': [35.85, -86.39], 'Franklin': [35.93, -86.87], 'Johnson City': [36.30, -82.35],
  'Hendersonville': [36.30, -86.60], 'Kingsport': [36.55, -82.56], 'Collierville': [35.05, -89.66],
  'Smyrna': [35.98, -86.52], 'Germantown': [35.09, -89.82], 'Brentwood': [36.03, -86.78],
  'Jackson': [35.65, -88.81], 'Asheville': [35.60, -82.55], 'Concord': [35.41, -80.58],
  'Gastonia': [35.26, -81.19], 'Chapel Hill': [35.91, -79.06], 'Burlington': [36.10, -79.44],
  'Clearwater': [27.97, -82.76], 'Lakeland': [28.04, -81.95], 'Palm Bay': [28.03, -80.59],
  'Pompano Beach': [26.24, -80.12], 'Boca Raton': [26.36, -80.10], 'Sarasota': [27.34, -82.53],
  'Cape Coral': [26.56, -81.95], 'Fort Myers': [26.64, -81.87], 'Naples': [26.14, -81.79],
  'Syracuse': [43.05, -76.15], 'Albany': [42.65, -73.75], 'New Rochelle': [40.91, -73.78],
  'Mount Vernon': [40.91, -73.84], 'Schenectady': [42.81, -73.93], 'Utica': [43.10, -75.23],
  'Binghamton': [42.10, -75.91], 'Troy': [42.73, -73.69], 'Niagara Falls': [43.09, -79.06],
  'Goodyear': [33.44, -112.36], 'Buckeye': [33.37, -112.58], 'Avondale': [33.44, -112.35],
  'League City': [29.51, -95.10], 'Sugar Land': [29.62, -95.63], 'Katy': [29.79, -95.82],
  'Pearland': [29.56, -95.29], 'Cypress': [29.97, -95.70], 'Round Rock': [30.51, -97.68],
  'Roswell': [34.02, -84.36], 'Alpharetta': [34.08, -84.30], 'Sandy Springs': [33.94, -84.37],
  'Dunwoody': [33.95, -84.34], 'Marietta': [33.95, -84.55], 'Smyrna': [33.88, -84.51],
  'Peachtree Corners': [33.97, -84.22], 'Newnan': [33.38, -84.80], 'Lawrenceville': [33.96, -83.99],
};

function getCoords(city) {
  const clean = city.replace(/,\s*[A-Z]{2}$/, '').trim();
  return CITY_COORDS[clean] || null;
}

async function scrapeGoogleMaps(niche, location, maxResults = 30) {
  const leads = [];
  const seen = new Set();
  const cityName = location.split(',')[0]?.trim() || location;
  const stateCode = location.split(',')[1]?.trim() || '';
  const coords = getCoords(cityName);

  if (!coords) {
    console.log(`  No coordinates for "${cityName}", skipping`);
    return leads;
  }

  const [lat, lon] = coords;
  const bbox = getBounding(lat, lon, 20000);

  const tags = NICHE_OSM[niche] || ['shop=' + niche.toLowerCase().replace(/\s+/g, '_')];

  for (const tag of tags) {
    if (leads.length >= maxResults) break;

    const tagParts = tag.split('=');
    const tagKey = tagParts[0];
    const tagVal = tagParts[1];

    const query = `[out:json][timeout:25];node["${tagKey}"="${tagVal}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out body;`;
    const body = `data=${encodeURIComponent(query)}`;

    try {
      console.log(`  Overpass: ${niche} (${tag}) in ${cityName} [${bbox.south},${bbox.west},${bbox.north},${bbox.east}]`);
      const raw = await httpPost(OVERPASS_MIRROR, body);
      const data = JSON.parse(raw);

      if (!data.elements) {
        console.log(`  No elements in response`);
        continue;
      }

      console.log(`  Got ${data.elements.length} elements`);

      for (const el of data.elements) {
        if (leads.length >= maxResults) break;
        if (seen.has(el.id)) continue;
        seen.add(el.id);

        const name = el.tags?.name;
        if (!name || name.length < 3) continue;

        const website = el.tags?.website || el.tags?.['contact:website'] || null;
        const phone = el.tags?.phone || el.tags?.['contact:phone'] || null;

        leads.push({
          business_name: name,
          phone,
          website,
          address: el.tags?.['addr:housenumber'] ? `${el.tags['addr:housenumber']} ${el.tags['addr:street'] || ''}`.trim() : el.tags?.['addr:street'] || null,
          city: el.tags?.['addr:city'] || cityName,
          state: el.tags?.['addr:state'] || stateCode,
          niche,
          has_website: !!website,
          source: 'openstreetmap',
          rating: null,
          reviews: null,
          latitude: el.lat,
          longitude: el.lon,
          website_analysis: website ? { is_outdated: false, has_mobile: true, has_ssl: website.startsWith('https') } : null,
        });
      }
    } catch(e) {
      console.log(`  Overpass error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`  Total: ${leads.length} leads for "${niche} in ${cityName}, ${stateCode}"`);
  return leads;
}

module.exports = { scrapeGoogleMaps };
