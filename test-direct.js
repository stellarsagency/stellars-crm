const { PowerScraper } = require('./power-scraper');
async function test() {
  const s = new PowerScraper();
  await s.init();
  const leads = await s.scrapeGoogleMaps('Pest Control', 'Dallas', 'TX', 3);
  console.log('Direct test results:', leads.length);
  leads.forEach(l => console.log('  ' + l.business_name + ' | ' + (l.phone||'-')));
  await s.close();
}
test().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
