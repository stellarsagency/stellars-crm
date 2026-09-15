const { fork } = require('child_process');
const path = require('path');
const child = fork(path.join(__dirname, 'scraper-worker.js'));
child.on('message', (msg) => { 
  console.log('Got:', msg.type, msg.leads ? msg.leads.length + ' leads' : msg.error || ''); 
  if (msg.leads) {
    for (const l of msg.leads) {
      console.log('  ' + l.business_name + ' | ' + (l.phone || '-') + ' | ' + (l.website || 'no website'));
    }
  }
  process.exit(0); 
});
child.on('error', (e) => { console.error('Error:', e.message); process.exit(1); });
child.on('exit', (code) => { console.log('Worker exited:', code); process.exit(code || 0); });
child.send({ type: 'scrape', niche: 'Pest Control', city: 'Dallas', state: 'TX', maxResults: 5 });
setTimeout(() => { console.log('Timeout - worker still running'); child.kill(); process.exit(1); }, 120000);
