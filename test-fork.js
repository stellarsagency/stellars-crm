const { fork } = require('child_process');
const path = require('path');
const child = fork(path.join(__dirname, 'scraper-worker.js'));
child.on('message', (m) => { console.log('MSG:', JSON.stringify(m).slice(0,200)); process.exit(0); });
child.on('error', (e) => { console.error('ERR:', e.message); process.exit(1); });
child.on('exit', (c) => { console.log('EXIT:', c); });
child.send({ type: 'scrape', niche: 'Pest Control', city: 'Dallas', state: 'TX', maxResults: 3 });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
