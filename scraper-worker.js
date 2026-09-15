/**
 * Scraper Worker - writes results to file for the server to read
 */
const { PowerScraper } = require('./power-scraper');
const fs = require('fs');
const path = require('path');

const resultFile = path.join(__dirname, '.scraper-result.json');

async function run() {
  const argsFile = process.argv[2];
  if (!argsFile) { console.error('No args file'); process.exit(1); }

  const args = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
  console.error(`[Worker] Scraping: ${args.niche} in ${args.city}`);

  try {
    const scraper = new PowerScraper(args.headless !== false);
    const leads = await scraper.search(args.niche, args.city, args.state, args.maxResults);
    console.error(`[Worker] Done: ${leads.length} leads`);
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'done', leads }));
  } catch (e) {
    console.error(`[Worker] Error: ${e.message}`);
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'error', error: e.message }));
  }
  process.exit(0);
}

run();
