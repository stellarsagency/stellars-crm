const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { initDB, queryAll, queryOne, run } = require('./db');

process.on('uncaughtException', (err) => { console.error('Uncaught:', err.message); });
process.on('unhandledRejection', (err) => { console.error('Unhandled:', err.message || err); });

const app = express();
const PORT = 3000;

function hashPass(pw) { return crypto.createHash('sha256').update(pw).digest('hex'); }
let currentUser = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbReady = false;

async function start() {
  await initDB();
  dbReady = true;
  console.log('Database initialized');

  // ==================== AUTH ====================
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = queryOne('SELECT * FROM users WHERE username=? AND active=1', [username]);
    if (!user || user.password !== hashPass(password)) return res.status(401).json({ error: 'Invalid credentials' });
    currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
    res.json(currentUser);
  });

  app.post('/api/auth/register', (req, res) => {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'All fields required' });
    const existing = queryOne('SELECT id FROM users WHERE username=?', [username]);
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const r = run('INSERT INTO users (username,password,name,role) VALUES (?,?,?,?)', [username, hashPass(password), name, role || 'caller']);
    currentUser = { id: r.lastInsertRowid, username, name, role: role || 'caller' };
    res.json(currentUser);
  });

  app.get('/api/auth/me', (req, res) => {
    if (!currentUser) return res.status(401).json({ error: 'Not logged in' });
    res.json(currentUser);
  });

  app.post('/api/auth/logout', (req, res) => {
    currentUser = null;
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/users', (req, res) => {
    if (!currentUser || currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const users = queryAll('SELECT id,username,name,role,active,created_at FROM users');
    res.json(users);
  });

  app.delete('/api/auth/users/:id', (req, res) => {
    if (!currentUser || currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    run('UPDATE users SET active=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Deactivated' });
  });

  // ==================== STATS ====================
  app.get('/api/stats', (req, res) => {
    const total = queryOne('SELECT COUNT(*) as c FROM leads')?.c || 0;
    const newLeads = queryOne("SELECT COUNT(*) as c FROM leads WHERE status='new'")?.c || 0;
    const contacted = queryOne("SELECT COUNT(*) as c FROM leads WHERE status='contacted'")?.c || 0;
    const demosSent = queryOne("SELECT COUNT(*) as c FROM leads WHERE status='demo_sent'")?.c || 0;
    const meetings = queryOne("SELECT COUNT(*) as c FROM leads WHERE status IN ('meeting_booked','meeting_done')")?.c || 0;
    const closedWon = queryOne("SELECT COUNT(*) as c FROM leads WHERE status='closed_won'")?.c || 0;
    const closedLost = queryOne("SELECT COUNT(*) as c FROM leads WHERE status='closed_lost'")?.c || 0;
    const revenue = queryOne("SELECT COALESCE(SUM(deal_value),0) as t FROM leads WHERE status='closed_won'")?.t || 0;
    const pipeline = queryOne("SELECT COALESCE(SUM(deal_value),0) as t FROM leads WHERE status IN ('demo_sent','meeting_booked','negotiation')")?.t || 0;
    const todayFollowups = queryOne("SELECT COUNT(*) as c FROM leads WHERE followup_date=date('now','localtime') AND followup_date IS NOT NULL AND followup_date!=''")?.c || 0;
    const todayMeetings = queryOne("SELECT COUNT(*) as c FROM leads WHERE meeting_date=date('now','localtime') AND meeting_date IS NOT NULL AND meeting_date!=''")?.c || 0;
    const thisWeek = queryOne("SELECT COUNT(*) as c FROM leads WHERE created_at>=date('now','localtime','-7 days')")?.c || 0;
    const thisMonth = queryOne("SELECT COUNT(*) as c FROM leads WHERE created_at>=date('now','localtime','start of month')")?.c || 0;
    const conversionRate = total > 0 ? ((closedWon / total) * 100).toFixed(1) : 0;
    const avgDealValue = closedWon > 0 ? Math.round(revenue / closedWon) : 0;

    const dailyCalls = queryAll(`
      SELECT date(called_at) as day, COUNT(*) as count 
      FROM call_logs WHERE called_at>=date('now','localtime','-30 days')
      GROUP BY date(called_at) ORDER BY day
    `);
    const statusBreakdown = queryAll('SELECT status, COUNT(*) as count FROM leads GROUP BY status');
    const nicheBreakdown = queryAll("SELECT COALESCE(niche,'Other') as niche, COUNT(*) as count FROM leads GROUP BY niche ORDER BY count DESC LIMIT 10");
    const topReps = queryAll(`
      SELECT sr.name, sr.avatar_color,
        COUNT(l.id) as assigned,
        SUM(CASE WHEN l.status='closed_won' THEN 1 ELSE 0 END) as closed,
        COALESCE(SUM(CASE WHEN l.status='closed_won' THEN l.deal_value ELSE 0 END),0) as revenue
      FROM sales_reps sr LEFT JOIN leads l ON l.assigned_to=sr.id
      WHERE sr.active=1 GROUP BY sr.id ORDER BY revenue DESC
    `);

    res.json({ total, newLeads, contacted, demosSent, meetings, closedWon, closedLost, revenue, pipeline, todayFollowups, todayMeetings, thisWeek, thisMonth, conversionRate: parseFloat(conversionRate), avgDealValue, dailyCalls, statusBreakdown, nicheBreakdown, topReps });
  });

  // ==================== LEADS ====================
  app.get('/api/leads', (req, res) => {
    const { status, assigned_to, search, niche, city, limit, offset } = req.query;
    let q = 'SELECT l.*, sr.name as rep_name, sr.avatar_color as rep_color FROM leads l LEFT JOIN sales_reps sr ON l.assigned_to=sr.id WHERE 1=1';
    const p = [];
    if (status) { q += ' AND l.status=?'; p.push(status); }
    if (assigned_to) { q += ' AND l.assigned_to=?'; p.push(assigned_to); }
    if (niche) { q += ' AND l.niche LIKE ?'; p.push(`%${niche}%`); }
    if (city) { q += ' AND l.city LIKE ?'; p.push(`%${city}%`); }
    if (search) { q += ' AND (l.business_name LIKE ? OR l.owner_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    q += ' ORDER BY l.created_at DESC';
    if (limit) { q += ` LIMIT ?`; p.push(parseInt(limit)); }
    if (offset) { q += ` OFFSET ?`; p.push(parseInt(offset)); }
    res.json(queryAll(q, p));
  });

  app.get('/api/leads/:id', (req, res) => {
    const lead = queryOne('SELECT l.*, sr.name as rep_name FROM leads l LEFT JOIN sales_reps sr ON l.assigned_to=sr.id WHERE l.id=?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    const calls = queryAll('SELECT cl.*, sr.name as rep_name FROM call_logs cl LEFT JOIN sales_reps sr ON cl.rep_id=sr.id WHERE cl.lead_id=? ORDER BY cl.called_at DESC', [req.params.id]);
    const activities = queryAll('SELECT * FROM activities WHERE lead_id=? ORDER BY created_at DESC LIMIT 20', [req.params.id]);
    res.json({ ...lead, calls, activities });
  });

  app.post('/api/leads', (req, res) => {
    const b = req.body;
    const r = run(`INSERT INTO leads (business_name,owner_name,phone,email,website,city,state,niche,rating,reviews,status,source,tags,notes,google_maps,has_website,score,lead_category,latitude,longitude)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.business_name, b.owner_name||null, b.phone||null, b.email||null, b.website||null, b.city||null, b.state||null, b.niche||null,
       b.rating||null, b.reviews||null, b.status||'new', b.source||'manual', b.tags||null, b.notes||null, b.google_maps||null,
       b.has_website ? 1 : 0, b.score||0, b.lead_category||'cold', b.latitude||null, b.longitude||null]);
    run('INSERT INTO activities (lead_id,type,description) VALUES (?,?,?)', [r.lastInsertRowid, 'created', 'Lead created']);
    res.json({ id: r.lastInsertRowid, message: 'Lead created' });
  });

  app.post('/api/leads/bulk', (req, res) => {
    const leads = req.body.leads || [];
    let count = 0;
    for (const l of leads) {
      run(`INSERT INTO leads (business_name,owner_name,phone,email,website,city,state,niche,rating,reviews,status,source,has_website,latitude,longitude,notes,address,maps_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [l.business_name, l.owner_name||null, l.phone||null, l.email||null, l.website||null, l.city||null, l.state||null, l.niche||null,
         l.rating||null, l.reviews||null, 'new', l.source||'scraper', l.has_website?1:0, l.latitude||null, l.longitude||null, l.notes||null, l.address||null, l.maps_url||null]);
      count++;
    }
    res.json({ message: `${count} leads imported`, count });
  });

  app.put('/api/leads/:id', (req, res) => {
    const lead = queryOne('SELECT * FROM leads WHERE id=?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    const fields = ['status','assigned_to','demo_sent','demo_sent_at','meeting_date','meeting_time','meeting_link',
      'meeting_status','followup_date','followup_time','followup_note','deal_value','deal_closed',
      'contact_method','outcome','pain','business_detail','notes','tags','city','state','niche','phone','website'];
    const updates = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=?`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    updates.push("updated_at=datetime('now','localtime')");
    params.push(req.params.id);
    run(`UPDATE leads SET ${updates.join(',')} WHERE id=?`, params);

    if (req.body.status && req.body.status !== lead.status) {
      run('INSERT INTO activities (lead_id,type,description) VALUES (?,?,?)', [req.params.id, 'status_change', `Status changed: ${lead.status} → ${req.body.status}`]);
    }
    if (req.body.assigned_to !== undefined && req.body.assigned_to !== lead.assigned_to) {
      const rep = req.body.assigned_to ? queryOne('SELECT name FROM sales_reps WHERE id=?', [req.body.assigned_to]) : null;
      run('INSERT INTO activities (lead_id,type,description) VALUES (?,?,?)', [req.params.id, 'assigned', `Assigned to ${rep ? rep.name : 'Unassigned'}`]);
    }
    res.json({ message: 'Updated' });
  });

  app.delete('/api/leads/:id', (req, res) => {
    run('DELETE FROM activities WHERE lead_id=?', [req.params.id]);
    run('DELETE FROM call_logs WHERE lead_id=?', [req.params.id]);
    run('DELETE FROM leads WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  });

  // ==================== PIPELINE ====================
  app.get('/api/pipeline', (req, res) => {
    const cols = ['new','contacted','demo_sent','meeting_booked','meeting_done','negotiation','closed_won','closed_lost'];
    const pipeline = {};
    for (const c of cols) {
      pipeline[c] = queryAll('SELECT l.*, sr.name as rep_name, sr.avatar_color as rep_color FROM leads l LEFT JOIN sales_reps sr ON l.assigned_to=sr.id WHERE l.status=? ORDER BY l.created_at DESC', [c]);
    }
    res.json(pipeline);
  });

  // ==================== SALES REPS ====================
  app.get('/api/reps', (req, res) => {
    const reps = queryAll('SELECT * FROM sales_reps WHERE active=1 ORDER BY name');
    for (const r of reps) {
      r.assigned_leads = queryOne("SELECT COUNT(*) as c FROM leads WHERE assigned_to=?", [r.id])?.c || 0;
      r.closed_deals = queryOne("SELECT COUNT(*) as c FROM leads WHERE assigned_to=? AND status='closed_won'", [r.id])?.c || 0;
      r.revenue = queryOne("SELECT COALESCE(SUM(deal_value),0) as t FROM leads WHERE assigned_to=? AND status='closed_won'", [r.id])?.t || 0;
    }
    res.json(reps);
  });

  app.post('/api/reps', (req, res) => {
    const { name, email, phone, role, avatar_color } = req.body;
    const colors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#ec4899','#8b5cf6','#06b6d4','#14b8a6'];
    const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];
    const r = run('INSERT INTO sales_reps (name,email,phone,role,avatar_color) VALUES (?,?,?,?,?)', [name, email||null, phone||null, role||'closer', color]);
    res.json({ id: r.lastInsertRowid, message: 'Rep added' });
  });

  app.put('/api/reps/:id', (req, res) => {
    const { name, email, phone, role, active, avatar_color } = req.body;
    const u = [], p = [];
    if (name !== undefined) { u.push('name=?'); p.push(name); }
    if (email !== undefined) { u.push('email=?'); p.push(email); }
    if (phone !== undefined) { u.push('phone=?'); p.push(phone); }
    if (role !== undefined) { u.push('role=?'); p.push(role); }
    if (active !== undefined) { u.push('active=?'); p.push(active); }
    if (avatar_color !== undefined) { u.push('avatar_color=?'); p.push(avatar_color); }
    if (u.length === 0) return res.status(400).json({ error: 'Nothing' });
    p.push(req.params.id);
    run(`UPDATE sales_reps SET ${u.join(',')} WHERE id=?`, p);
    res.json({ message: 'Updated' });
  });

  app.delete('/api/reps/:id', (req, res) => {
    run('UPDATE sales_reps SET active=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Removed' });
  });

  // ==================== MEETINGS & FOLLOWUPS ====================
  app.get('/api/meetings', (req, res) => {
    const { date, rep_id } = req.query;
    let q = "SELECT l.*, sr.name as rep_name, sr.avatar_color as rep_color FROM leads l LEFT JOIN sales_reps sr ON l.assigned_to=sr.id WHERE l.status IN ('meeting_booked','meeting_done')";
    const p = [];
    if (date) { q += ' AND l.meeting_date=?'; p.push(date); }
    if (rep_id) { q += ' AND l.assigned_to=?'; p.push(rep_id); }
    q += ' ORDER BY l.meeting_date ASC, l.meeting_time ASC';
    res.json(queryAll(q, p));
  });

  app.get('/api/followups', (req, res) => {
    const { date, rep_id } = req.query;
    let q = "SELECT l.*, sr.name as rep_name, sr.avatar_color as rep_color FROM leads l LEFT JOIN sales_reps sr ON l.assigned_to=sr.id WHERE l.followup_date IS NOT NULL AND l.followup_date!=''";
    const p = [];
    if (date) { q += ' AND l.followup_date<=?'; p.push(date); }
    if (rep_id) { q += ' AND l.assigned_to=?'; p.push(rep_id); }
    q += ' ORDER BY l.followup_date ASC, l.followup_time ASC';
    res.json(queryAll(q, p));
  });

  // ==================== ACTIVITIES ====================
  app.get('/api/activities', (req, res) => {
    const { lead_id, limit } = req.query;
    let q = 'SELECT a.*, l.business_name FROM activities a LEFT JOIN leads l ON a.lead_id=l.id';
    const p = [];
    if (lead_id) { q += ' WHERE a.lead_id=?'; p.push(lead_id); }
    q += ' ORDER BY a.created_at DESC';
    if (limit) { q += ` LIMIT ?`; p.push(parseInt(limit)); } else { q += ' LIMIT 50'; }
    res.json(queryAll(q, p));
  });

  // ==================== BLAND.AI CALLS ====================
  app.post('/api/call', async (req, res) => {
    const { phone_number, lead_id } = req.body;
    const apiKey = queryOne("SELECT value FROM settings WHERE key='bland_api_key'");
    if (!apiKey || !apiKey.value) return res.status(400).json({ error: 'Add Bland.ai API key in Settings' });

    try {
      const agentId = queryOne("SELECT value FROM settings WHERE key='bland_agent_id'");
      const response = await fetch('https://api.bland.ai/v1/calls', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number,
          agent_id: agentId?.value || undefined,
          task: "You are Alex from Stellars Digital calling about a FREE website demo. Be brief, professional. Ask if they have time for 30 seconds. Offer a free demo website. Get their email to send the demo.",
          max_duration: 180,
          record: true,
          answered_by_enabled: true,
          metadata: { lead_id: lead_id?.toString() || '' }
        })
      });
      const data = await response.json();
      if (data.call_id) {
        run('INSERT INTO call_logs (lead_id,call_sid,outcome) VALUES (?,?,?)', [lead_id||null, data.call_id, 'initiated']);
        if (lead_id) {
          run("UPDATE leads SET status='contacted',updated_at=datetime('now','localtime') WHERE id=?", [lead_id]);
          run('INSERT INTO activities (lead_id,type,description) VALUES (?,?,?)', [lead_id, 'call', 'AI call initiated']);
        }
        res.json({ success: true, call_id: data.call_id });
      } else {
        res.status(400).json({ error: data.message || 'Failed' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/calls', (req, res) => {
    const { lead_id, limit } = req.query;
    let q = 'SELECT cl.*, l.business_name, l.owner_name, sr.name as rep_name FROM call_logs cl LEFT JOIN leads l ON cl.lead_id=l.id LEFT JOIN sales_reps sr ON cl.rep_id=sr.id';
    const p = [];
    if (lead_id) { q += ' WHERE cl.lead_id=?'; p.push(lead_id); }
    q += ' ORDER BY cl.called_at DESC LIMIT ?';
    p.push(parseInt(limit) || 50);
    res.json(queryAll(q, p));
  });

  // ==================== SETTINGS ====================
  app.get('/api/settings', (req, res) => {
    const settings = queryAll('SELECT * FROM settings');
    const obj = {};
    for (const s of settings) obj[s.key] = s.value;
    res.json(obj);
  });

  app.put('/api/settings', (req, res) => {
    for (const [k, v] of Object.entries(req.body)) {
      run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,datetime('now','localtime'))", [k, v]);
    }
    res.json({ message: 'Settings saved' });
  });

  // ==================== SCRAPER (open-source maps-scrapper) ====================
  const { exec } = require('child_process');
  const fs = require('fs');
  const scraperDir = path.join(__dirname, '..', 'maps-scrapper');
  const outputDir = path.join(scraperDir, 'output');
  let scraperState = { status: 'idle', leads: [], error: null, started: null, runId: 0 };
  let allScrapedLeads = []; // Accumulate all results
  const resultFile = path.join(__dirname, 'scrape-results.json');

  // Different nearby cities/areas to get more unique results
  function getSearchLocations(city, state) {
    const c = city.toLowerCase();
    const s = (state || '').toUpperCase();
    
    // Full state lists - ALL major cities
    const stateLists = {
      '__whole_usa': ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX', 'Atlanta, GA', 'Savannah, GA', 'Augusta, GA', 'Miami, FL', 'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'New York, NY', 'Buffalo, NY', 'Rochester, NY', 'Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Los Angeles, CA', 'San Diego, CA', 'Sacramento, CA', 'Las Vegas, NV', 'Reno, NV', 'Chicago, IL', 'Springfield, IL', 'Columbus, OH', 'Cleveland, OH', 'Cincinnati, OH', 'Indianapolis, IN', 'Fort Wayne, IN', 'Seattle, WA', 'Spokane, WA', 'Portland, OR', 'Eugene, OR', 'Denver, CO', 'Colorado Springs, CO', 'Kansas City, MO', 'St. Louis, MO', 'Oklahoma City, OK', 'Tulsa, OK', 'Little Rock, AR', 'Birmingham, AL', 'Montgomery, AL', 'Louisville, KY', 'Lexington, KY', 'Memphis, TN', 'New Orleans, LA', 'Baton Rouge, LA', 'Pittsburgh, PA', 'Philadelphia, PA', 'Baltimore, MD', 'Richmond, VA', 'Virginia Beach, VA'],
      '__state_tx': ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX', 'El Paso, TX', 'Arlington, TX', 'Corpus Christi, TX', 'Plano, TX', 'Lubbock, TX', 'Laredo, TX', 'Irving, TX', 'Garland, TX', 'Amarillo, TX', 'Grand Prairie, TX', 'Brownsville, TX', 'McKinney, TX', 'Frisco, TX', 'Pasadena, TX', 'Mesquite, TX', 'Killeen, TX', 'McAllen, TX', 'Midland, TX', 'Beaumont, TX', 'Denton, TX', 'Carrollton, TX', 'Round Rock, TX', 'Abilene, TX', 'Pearland, TX', 'Sugar Land, TX'],
      '__state_ga': ['Atlanta, GA', 'Augusta, GA', 'Savannah, GA', 'Athens, GA', 'Sandy Springs, GA', 'Roswell, GA', 'Macon, GA', 'Johns Creek, GA', 'Albany, GA', 'Marietta, GA', 'Warner Robins, GA', 'Alpharetta, GA', 'Smyrna, GA', 'Valdosta, GA', 'Dunwoody, GA', 'Rome, GA', 'Gainesville, GA', 'Peachtree Corners, GA', 'Newnan, GA', 'Dalton, GA'],
      '__state_fl': ['Miami, FL', 'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'St. Petersburg, FL', 'Tallahassee, FL', 'Fort Lauderdale, FL', 'Cape Coral, FL', 'Pembroke Pines, FL', 'Hollywood, FL', 'Gainesville, FL', 'Miramar, FL', 'Coral Springs, FL', 'Clearwater, FL', 'Palm Bay, FL', 'West Palm Beach, FL', 'Lakeland, FL', 'Pompano Beach, FL', 'Boca Raton, FL', 'Sarasota, FL'],
      '__state_ny': ['New York, NY', 'Buffalo, NY', 'Rochester, NY', 'Yonkers, NY', 'Syracuse, NY', 'Albany, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Schenectady, NY', 'Utica, NY', 'Binghamton, NY', 'Tonawanda, NY', 'Troy, NY', 'Niagara Falls, NY', 'White Plains, NY', 'Hempstead, NY', 'Islip, NY', 'Babylon, NY', 'Huntington, NY', 'Stamford, CT'],
      '__state_az': ['Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Scottsdale, AZ', 'Gilbert, AZ', 'Glendale, AZ', 'Tempe, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Yuma, AZ', 'Flagstaff, AZ', 'Goodyear, AZ', 'Lake Havasu City, AZ', 'Buckeye, AZ', 'Avondale, AZ', 'Sedona, AZ', 'Prescott, AZ', 'Sierra Vista, AZ', 'Casa Grande, AZ'],
      '__state_nc': ['Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Winston-Salem, NC', 'Durham, NC', 'Fayetteville, NC', 'Cary, NC', 'Wilmington, NC', 'High Point, NC', 'Greenville, NC', 'Asheville, NC', 'Concord, NC', 'Gastonia, NC', 'Chapel Hill, NC', 'Jacksonville, NC', 'Burlington, NC', 'Rocky Mount, NC', 'Huntersville, NC', 'Mooresville, NC', 'Hendersonville, NC'],
      '__state_tn': ['Memphis, TN', 'Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Clarksville, TN', 'Murfreesboro, TN', 'Franklin, TN', 'Johnson City, TN', 'Bartlett, TN', 'Hendersonville, TN', 'Kingsport, TN', 'Collierville, TN', 'Smyrna, TN', 'Germantown, TN', 'Brentwood, TN', 'Jackson, TN', 'Oak Ridge, TN', 'Mount Juliet, TN', 'La Vergne, TN', 'Cookeville, TN']
    };
    if (stateLists[c]) return stateLists[c];
    
    // Small city groups - HIGH CONVERSION targets
    const smallCityGroups = {
      '__small_tx': ['League City, TX', 'Sugar Land, TX', 'Katy, TX', 'Pearland, TX', 'Cypress, TX', 'Frisco, TX', 'McKinney, TX', 'Allen, TX', 'Plano, TX', 'Round Rock, TX', 'Cedar Park, TX', 'Leander, TX', 'Georgetown, TX', 'Kyle, TX', 'Buda, TX', 'New Braunfels, TX', 'San Marcos, TX', 'Boerne, TX', 'Helotes, TX', 'Converse, TX'],
      '__small_ga': ['Alpharetta, GA', 'Roswell, GA', 'Kennesaw, GA', 'Lawrenceville, GA', 'Duluth, GA', 'Johns Creek, GA', 'Suwanee, GA', 'Buford, GA', 'Snellville, GA', 'Conyers, GA', 'Woodstock, GA', 'Canton, GA', 'Marietta, GA', 'Decatur, GA', 'Smyrna, GA', 'Lilburn, GA', 'Norcross, GA', 'Stone Mountain, GA', 'Mableton, GA', 'Newnan, GA'],
      '__small_fl': ['Coral Gables, FL', 'Aventura, FL', 'Plantation, FL', 'Sunrise, FL', 'Pembroke Pines, FL', 'Miramar, FL', 'Boca Raton, FL', 'Delray Beach, FL', 'Boynton Beach, FL', 'Wellington, FL', 'Cape Coral, FL', 'Fort Myers, FL', 'Naples, FL', 'Sarasota, FL', 'Bradenton, FL', 'Lakeland, FL', 'Winter Haven, FL', 'Palm Harbor, FL', 'Dunedin, FL', 'Largo, FL'],
      '__small_ny': ['White Plains, NY', 'New Rochelle, NY', 'Yonkers, NY', 'Mount Vernon, NY', 'Long Beach, NY', 'Hempstead, NY', 'Garden City, NY', 'Mineola, NY', 'Freeport, NY', 'Valley Stream, NY', 'Hicksville, NY', 'Levittown, NY', 'Massapequa, NY', 'Brentwood, NY', 'Bay Shore, NY', 'Islip, NY', 'Babylon, NY', 'Huntington, NY', 'Stamford, CT', 'Greenwich, CT'],
      '__small_az': ['Scottsdale, AZ', 'Chandler, AZ', 'Gilbert, AZ', 'Mesa, AZ', 'Tempe, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Goodyear, AZ', 'Buckeye, AZ', 'Avondale, AZ', 'Queen Creek, AZ', 'Maricopa, AZ', 'Fountain Hills, AZ', 'Paradise Valley, AZ', 'Sedona, AZ', 'Prescott, AZ', 'Flagstaff, AZ', 'Sierra Vista, AZ', 'Casa Grande, AZ', 'Lake Havasu City, AZ'],
      '__small_nc': ['Huntersville, NC', 'Mooresville, NC', 'Concord, NC', 'Gastonia, NC', 'Matthews, NC', 'Mint Hill, NC', 'Indian Trail, NC', 'Rock Hill, SC', 'Spartanburg, SC', 'Greenville, SC', 'Salisbury, NC', 'Kannapolis, NC', 'Statesville, NC', 'Shelby, NC', 'Forest City, NC', 'Asheville, NC', 'Boone, NC', 'Hendersonville, NC', 'Brevard, NC', 'Burlington, NC'],
      '__small_tn': ['Murfreesboro, TN', 'Franklin, TN', 'Clarksville, TN', 'Lebanon, TN', 'Hendersonville, TN', 'Gallatin, TN', 'Smyrna, TN', 'La Vergne, TN', 'Mount Juliet, TN', 'Spring Hill, TN', 'Columbia, TN', 'Shelbyville, TN', 'Tullahoma, TN', 'Cookeville, TN', 'Cleveland, TN', 'Athens, TN', 'Manchester, TN', 'Crossville, TN', 'Springfield, TN', 'Portland, TN']
    };
    
    if (smallCityGroups[c]) return smallCityGroups[c];
    // Predefined nearby cities for major metros
    const metros = {
      'houston': ['Houston, TX', 'Katy, TX', 'Sugar Land, TX', 'Pearland, TX', 'Spring, TX', 'Cypress, TX', 'League City, TX', 'Missouri City, TX', 'Pasadena, TX', 'Bellaire, TX', 'Woodlands, TX', 'Conroe, TX', 'Baytown, TX', 'Texas City, TX', 'La Marque, TX', 'Friendswood, TX', 'Manvel, TX', 'Rosenberg, TX', 'Richmond, TX', 'Fulshear, TX'],
      'dallas': ['Dallas, TX', 'Fort Worth, TX', 'Arlington, TX', 'Plano, TX', 'Irving, TX', 'Garland, TX', 'Frisco, TX', 'McKinney, TX', 'Mesquite, TX', 'Grand Prairie, TX'],
      'phoenix': ['Phoenix, AZ', 'Scottsdale, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Tempe, AZ', 'Glendale, AZ', 'Gilbert, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Goodyear, AZ'],
      'miami': ['Miami, FL', 'Fort Lauderdale, FL', 'Hialeah, FL', 'Hollywood, FL', 'Coral Gables, FL', 'Homestead, FL', 'Pompano Beach, FL', 'Boca Raton, FL', 'West Palm Beach, FL', 'Doral, FL'],
      'san antonio': ['San Antonio, TX', 'New Braunfels, TX', 'San Marcos, TX', 'Seguin, TX', 'Schertz, TX', 'Live Oak, TX', 'Universal City, TX', 'Converse, TX', 'Helotes, TX', 'Boerne, TX'],
      'austin': ['Austin, TX', 'Round Rock, TX', 'Cedar Park, TX', 'Georgetown, TX', 'Pflugerville, TX', 'San Marcos, TX', 'Leander, TX', 'Lakeway, TX', 'Kyle, TX', 'Buda, TX'],
      'atlanta': ['Atlanta, GA', 'Smyrna, GA', 'Roswell, GA', 'Alpharetta, GA', 'Marietta, GA', 'Decatur, GA', 'Lawrenceville, GA', 'Duluth, GA', 'Johns Creek, GA', 'Stone Mountain, GA', 'Kennesaw, GA', 'Woodstock, GA', 'Canton, GA', 'Conyers, GA', 'Snellville, GA', 'Lilburn, GA', 'Norcross, GA', 'Suwanee, GA', 'Buford, GA', 'Dahlonega, GA', 'Dallas, GA', 'Lithonia, GA', 'Mableton, GA', 'Villa Rica, GA', 'Newnan, GA', 'Peachtree City, GA', 'Fayetteville, GA', 'Griffin, GA', 'Covington, GA', 'McDonough, GA'],
      'nashville': ['Nashville, TN', 'Murfreesboro, TN', 'Franklin, TN', 'Clarksville, TN', 'Lebanon, TN', 'Hendersonville, TN', 'Gallatin, TN', 'Smyrna, TN', 'La Vergne, TN', 'Mount Juliet, TN'],
      'charlotte': ['Charlotte, NC', 'Concord, NC', 'Gastonia, NC', ' Huntersville, NC', 'Mooresville, NC', 'Rock Hill, SC', 'Matthews, NC', 'Mint Hill, NC', 'Indian Trail, NC', 'Lake Norman, NC'],
      'tampa': ['Tampa, FL', 'St. Petersburg, FL', 'Clearwater, FL', 'Brandon, FL', 'Lakeland, FL', 'Plant City, FL', 'Dade City, FL', 'New Port Richey, FL', 'Spring Hill, FL', 'Wesley Chapel, FL'],
      'new york': ['New York, NY', 'Brooklyn, NY', 'Queens, NY', 'Bronx, NY', 'Staten Island, NY', 'Yonkers, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Hempstead, NY', 'Islip, NY', 'Babylon, NY', 'Huntington, NY', 'Oyster Bay, NY', 'North Hempstead, NY', 'Jersey City, NJ', 'Newark, NJ', 'Paterson, NJ', 'Elizabeth, NJ', 'Stamford, CT', 'White Plains, NY', 'Long Beach, NY', 'Valley Stream, NY', 'Freeport, NY', 'Garden City, NY', 'Mineola, NY', 'Hicksville, NY', 'Levittown, NY', 'Massapequa, NY', 'Brentwood, NY', 'Bay Shore, NY']
    };
    for (const [key, cities] of Object.entries(metros)) {
      if (c.includes(key)) return cities;
    }
    // Fallback: just use the city itself
    return [`${city}, ${s}`];
  }

  app.post('/api/scraper/run', (req, res) => {
    const { niche, city, state, max_results, headless, goalType, goalCount } = req.body;
    if (!niche || !city) return res.status(400).json({ error: 'niche and city required' });

    if (scraperState.status === 'running') return res.json({ status: 'running', runId: scraperState.runId });

    scraperState = { status: 'running', leads: [], error: null, started: Date.now(), runId: (scraperState.runId || 0) + 1 };
    allScrapedLeads = [];
    const currentRunId = scraperState.runId;
    console.log(`Scraper started: ${niche} in ${city} — Goal: ${goalCount || 50} ${goalType || 'all'}`);

    res.json({ status: 'started', runId: scraperState.runId });

    // Resolve city lists
    const allCityLists = {
      '__whole_usa': ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX', 'Atlanta, GA', 'Savannah, GA', 'Miami, FL', 'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'New York, NY', 'Buffalo, NY', 'Phoenix, AZ', 'Tucson, AZ', 'Charlotte, NC', 'Raleigh, NC', 'Nashville, TN', 'Knoxville, TN', 'Los Angeles, CA', 'San Diego, CA', 'Las Vegas, NV', 'Chicago, IL', 'Columbus, OH', 'Cleveland, OH', 'Indianapolis, IN', 'Seattle, WA', 'Portland, OR', 'Denver, CO', 'Kansas City, MO', 'Oklahoma City, OK', 'Birmingham, AL', 'Louisville, KY', 'Memphis, TN', 'New Orleans, LA', 'Pittsburgh, PA', 'Philadelphia, PA', 'Baltimore, MD', 'Richmond, VA'],
      '__state_tx': ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX', 'El Paso, TX', 'Arlington, TX', 'Corpus Christi, TX', 'Plano, TX', 'Lubbock, TX', 'Laredo, TX', 'Irving, TX', 'Garland, TX', 'Amarillo, TX', 'Grand Prairie, TX', 'Brownsville, TX', 'McKinney, TX', 'Frisco, TX', 'Pasadena, TX', 'Mesquite, TX'],
      '__state_ga': ['Atlanta, GA', 'Augusta, GA', 'Savannah, GA', 'Athens, GA', 'Sandy Springs, GA', 'Roswell, GA', 'Macon, GA', 'Johns Creek, GA', 'Albany, GA', 'Marietta, GA'],
      '__state_fl': ['Miami, FL', 'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'St. Petersburg, FL', 'Tallahassee, FL', 'Fort Lauderdale, FL', 'Cape Coral, FL', 'Pembroke Pines, FL', 'Hollywood, FL'],
      '__state_ny': ['New York, NY', 'Buffalo, NY', 'Rochester, NY', 'Yonkers, NY', 'Syracuse, NY', 'Albany, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Schenectady, NY', 'Utica, NY'],
      '__state_az': ['Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Scottsdale, AZ', 'Gilbert, AZ', 'Glendale, AZ', 'Tempe, AZ', 'Peoria, AZ', 'Surprise, AZ'],
      '__state_nc': ['Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Winston-Salem, NC', 'Durham, NC', 'Fayetteville, NC', 'Cary, NC', 'Wilmington, NC', 'High Point, NC', 'Greenville, NC'],
      '__state_tn': ['Memphis, TN', 'Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Clarksville, TN', 'Murfreesboro, TN', 'Franklin, TN', 'Johnson City, TN', 'Bartlett, TN', 'Hendersonville, TN'],
      '__small_tx': ['League City, TX', 'Sugar Land, TX', 'Katy, TX', 'Pearland, TX', 'Cypress, TX', 'Frisco, TX', 'McKinney, TX', 'Allen, TX', 'Plano, TX', 'Round Rock, TX'],
      '__small_ga': ['Roswell, GA', 'Alpharetta, GA', 'Sandy Springs, GA', 'Johns Creek, GA', 'Dunwoody, GA', 'Marietta, GA', 'Smyrna, GA', 'Peachtree Corners, GA', 'Newnan, GA', 'Lawrenceville, GA'],
      '__small_fl': ['Clearwater, FL', 'St. Petersburg, FL', 'Lakeland, FL', 'Palm Bay, FL', 'Pompano Beach, FL', 'Boca Raton, FL', 'Sarasota, FL', 'Cape Coral, FL', 'Fort Myers, FL', 'Naples, FL'],
      '__small_ny': ['Yonkers, NY', 'Syracuse, NY', 'Albany, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Schenectady, NY', 'Utica, NY', 'Binghamton, NY', 'Troy, NY', 'Niagara Falls, NY'],
      '__small_az': ['Scottsdale, AZ', 'Gilbert, AZ', 'Chandler, AZ', 'Tempe, AZ', 'Glendale, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Goodyear, AZ', 'Buckeye, AZ', 'Avondale, AZ'],
      '__small_nc': ['Cary, NC', 'Wilmington, NC', 'High Point, NC', 'Greenville, NC', 'Asheville, NC', 'Concord, NC', 'Gastonia, NC', 'Chapel Hill, NC', 'Jacksonville, NC', 'Burlington, NC'],
      '__small_tn': ['Murfreesboro, TN', 'Franklin, TN', 'Johnson City, TN', 'Hendersonville, TN', 'Kingsport, TN', 'Collierville, TN', 'Smyrna, TN', 'Germantown, TN', 'Brentwood, TN', 'Jackson, TN'],
    };

    let cities = [city];
    if (allCityLists[city]) cities = allCityLists[city];

    // Run Playwright scraper (Google Maps)
    const { exec } = require('child_process');
    const fs = require('fs');
    const pathMod = require('path');
    const scraperDir = 'C:\\Users\\Abdul Wadood\\Documents\\Default Project\\maps-scrapper';
    const outputDir = pathMod.join(scraperDir, 'output');

    const NICHE_QUERY = {
      'Pest Control': 'pest control', 'Auto Detailing': 'auto detailing', 'Painting': 'painting contractor',
      'Fence': 'fence contractor', 'Landscaping': 'landscaping', 'Pressure Washing': 'pressure washing',
      'Cleaning': 'cleaning service', 'Pool Service': 'pool service', 'Handyman': 'handyman',
      'Tattoo': 'tattoo', 'Concrete': 'concrete contractor',
    };

    (async () => {
      try {
        const goal = goalCount || 50;
        const query = NICHE_QUERY[niche] || niche.toLowerCase();

        for (const loc of cities) {
          if (scraperState.status !== 'running') break;
          console.log(`Scraping ${loc} for ${niche}...`);

          try {
            // Clean output dir
            try { fs.readdirSync(outputDir).filter(f => f.endsWith('.json')).forEach(f => fs.unlinkSync(pathMod.join(outputDir, f))); } catch(e) {}

            // Run Playwright scraper
            const maxResults = Math.min(25, goal * 2);
            await new Promise((resolve, reject) => {
              const child = exec(`node dist/index.js run -q "${query}" -l "${loc}" -m ${maxResults} --headless true --min-delay 100 --max-delay 300`, { cwd: scraperDir, timeout: 120000, windowsHide: true });
              child.stdout.on('data', d => {});
              child.stderr.on('data', d => {});
              child.on('close', () => resolve());
              child.on('error', () => resolve());
              setTimeout(resolve, 125000);
            });

            // Read output files
            const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
              try {
                const raw = JSON.parse(fs.readFileSync(pathMod.join(outputDir, file), 'utf8'));
                const items = raw.value || raw;
                if (!Array.isArray(items)) continue;
                const seenLocal = new Set();
                for (const item of items) {
                  const key = (item.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
                  if (!key || seenLocal.has(key)) continue;
                  seenLocal.add(key);
                  const addr = (item.address||'').split(',').map(s=>s.trim());
                  const lastPart = addr[addr.length-1] || '';
                  const stateZip = lastPart.match(/^([A-Z]{2})\s+\d{5}/);
                  let leadState = stateZip ? stateZip[1] : state || '';
                  if (!leadState || leadState.length > 2) leadState = state || '';
                  let leadCity = loc.split(',')[0]?.trim() || 'Unknown';
                  for (let i = addr.length - 2; i >= 1; i--) {
                    const p = addr[i];
                    if (p.match(/^[A-Z]{2}$/) || p.match(/^\d{5}/) || p === 'United States') continue;
                    leadCity = p; break;
                  }
                  // Fix bad city parsing
                  if (!leadCity || leadCity.length > 20 || leadCity.match(/^\d/) || leadCity.match(/^[A-Z]{2}\s+\d{5}/)) {
                    leadCity = loc.split(',')[0]?.trim() || 'Unknown';
                  }
                  allScrapedLeads.push({
                    business_name: item.name, phone: item.phone||null, website: item.website||null,
                    address: item.address||null, city: leadCity, state: leadState, niche,
                    rating: item.rating||0, reviews: item.reviewCount||0,
                    source: 'scraper', has_website: !!item.website,
                    latitude: item.lat||null, longitude: item.lng||null,
                    maps_url: item.url||null,
                    website_analysis: null,
                    notes: item.website ? 'Has website: '+item.website : 'No website - needs one'
                  });
                }
              } catch(e) {}
            }
            // Clean output
            try { fs.readdirSync(outputDir).filter(f => f.endsWith('.json')).forEach(f => fs.unlinkSync(pathMod.join(outputDir, f))); } catch(e) {}

            // Dedupe
            const seenMap = new Map();
            allScrapedLeads.forEach(l => { const k = l.business_name.toLowerCase().replace(/[^a-z0-9]/g,''); if (!seenMap.has(k)) seenMap.set(k, l); });
            allScrapedLeads = Array.from(seenMap.values());
            scraperState.leads = allScrapedLeads;
            console.log(`  ${loc}: ${allScrapedLeads.length} leads (total so far)`);
          } catch(e) { console.log(`  ${loc} failed: ${e.message}`); }

          if (goalType === 'no_website') { if (allScrapedLeads.filter(l => !l.has_website).length >= goal) break; }
          else if (allScrapedLeads.length >= goal) break;
        }

        // Deduplicate
        const seenMap = new Map();
        allScrapedLeads.forEach(l => { const key = l.business_name.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!seenMap.has(key)) seenMap.set(key, l); });
        allScrapedLeads = Array.from(seenMap.values());

        let finalLeads = allScrapedLeads;
        if (goalType === 'no_website') finalLeads = allScrapedLeads.filter(l => !l.has_website).slice(0, goal);
        else finalLeads = allScrapedLeads.slice(0, goal);

        scraperState = { status: 'done', leads: finalLeads, error: null, started: scraperState.started };
        console.log(`Scraper done: ${finalLeads.length} leads`);
      } catch(e) {
        scraperState = { status: 'error', leads: [], error: e.message, started: scraperState.started };
      }
    })();
  });

  app.get('/api/scraper/status', (req, res) => {
    res.json(scraperState);
  });

  // Geocode leads without location
  app.post('/api/leads/geocode', async (req, res) => {
    const leads = queryAll('SELECT id, business_name, city, state FROM leads WHERE latitude IS NULL OR longitude IS NULL');
    let geocoded = 0;
    const https = require('https');
    for (const lead of leads) {
      // Try city/state first, then business name + city
      const queries = [
        `${lead.city || ''}, ${lead.state || ''}`.trim(),
        `${lead.business_name}, ${lead.city || ''}, ${lead.state || ''}`
      ];
      for (const q of queries) {
        if (!q || q.length < 3) continue;
        const query = encodeURIComponent(q);
        try {
          const result = await new Promise((resolve) => {
            https.get(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, { headers: { 'User-Agent': 'CRM-App/1.0' } }, (resp) => {
              let data = '';
              resp.on('data', c => data += c);
              resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve([]); } });
            }).on('error', () => resolve([]));
            setTimeout(() => resolve([]), 5000);
          });
          if (result.length > 0) {
            run('UPDATE leads SET latitude=?, longitude=? WHERE id=?', [parseFloat(result[0].lat), parseFloat(result[0].lon), lead.id]);
            geocoded++;
            console.log(`Geocoded: ${lead.business_name} -> ${result[0].lat}, ${result[0].lon}`);
            break;
          }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 1100));
      }
    }
    res.json({ message: `Geocoded ${geocoded} of ${leads.length} leads` });
  });

  // Analyze a single website
  app.post('/api/scraper/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    try {
      const scraper = new PowerScraper();
      const analysis = await scraper.analyzeWebsite(url);
      res.json(analysis);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== LEAD FINDER (API fallback) ====================
  app.get('/api/finder/search', async (req, res) => {
    const { niche, city, state } = req.query;
    if (!niche || !city) return res.status(400).json({ error: 'niche and city required' });

    const apiKey = queryOne("SELECT value FROM settings WHERE key='google_api_key'");
    if (!apiKey || !apiKey.value) {
      const demoLeads = generateDemoLeads(niche, city, state);
      return res.json({ leads: demoLeads, source: 'demo', message: 'Add Google API key in Settings for real data, or use Real Scrape button' });
    }

    try {
      const query = `${niche} in ${city} ${state || ''}`;
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey.value}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== 'OK') return res.json({ leads: [], error: data.error_message || 'No results' });

      const leads = [];
      for (const place of data.results.slice(0, 20)) {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,rating,user_ratings_total,formatted_address&key=${apiKey.value}`;
        const detailRes = await fetch(detailUrl);
        const detail = await detailRes.json();
        const d = detail.result || {};
        leads.push({
          business_name: d.name || place.name, phone: d.formatted_phone_number || '', website: d.website || '',
          city, state: state || '', niche, rating: d.rating || place.rating || 0,
          reviews: d.user_ratings_total || place.user_ratings_total || 0,
          address: d.formatted_address || place.formatted_address || '',
          has_website: !!d.website, place_id: place.place_id
        });
      }
      res.json({ leads, source: 'google', count: leads.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/finder/analyze', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      const html = await response.text();
      const issues = [];
      let score = 100;
      if (!html.includes('viewport')) { issues.push({ type: 'critical', message: 'No mobile viewport' }); score -= 30; }
      if (html.includes('Flash') || html.includes('.swf')) { issues.push({ type: 'critical', message: 'Uses Flash' }); score -= 25; }
      if (html.includes('table') && html.includes('bgcolor')) { issues.push({ type: 'warning', message: 'Table layout' }); score -= 15; }
      if (!html.includes('og:image')) { issues.push({ type: 'info', message: 'No OG tags' }); score -= 5; }
      score = Math.max(0, Math.min(100, score));
      res.json({ url, score, grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'F', issues, recommendation: score < 60 ? 'Needs rebuild' : 'OK' });
    } catch (err) {
      res.json({ url, score: 0, grade: 'F', issues: [{ type: 'error', message: err.message }], recommendation: 'Check URL' });
    }
  });

  function generateDemoLeads(niche, city, state) {
    const names = {
      'Pest Control': ['ABC Pest Control', 'BugBusters Inc', 'PestAway Solutions', 'Terminator Pest', 'AllStar Exterminators'],
      'Landscaping': ['Green Thumb Landscapes', 'Lawn Pros', 'Elite Landscaping', 'Garden Masters', 'Green Valley'],
      'Plumbing': ['Quick Fix Plumbing', 'Pipe Masters', 'ProPlumb Services', 'Leak Detection Pro', 'All-Star Plumbing'],
      'HVAC': ['CoolAir HVAC', 'HeatMaster', 'Climate Control', 'AirFlow Systems', 'TemperaturePro'],
      'Auto Detailing': ['Shine Auto Spa', 'Pro Detail', 'Crystal Clear Auto', 'Prestige Detailing', 'Elite Auto Care'],
      'Fence': ['Fence Masters Pro', 'Iron Works Fence', 'AllStar Fence Co', 'Premium Fence Dallas', 'Fence Installers Plus'],
      'Pool Service': ['Pool Pros Service', 'Crystal Clear Pools', 'AquaCare Pool Service', 'Pristine Pool Clean', 'SunState Pool Care'],
      'Pressure Washing': ['PowerWash Pro', 'Clean Slate Pressure', 'SparkleWash Service', 'Pristine Power Clean', 'AllStar Pressure'],
      'Cleaning Services': ['ProClean Services', 'SparkleMaids', 'FreshSpace Cleaning', 'Elite Cleaning Co', 'PristineClean Pro'],
      'Tree Service': ['TreeBoss Service', 'Canopy Tree Care', 'Timberline Tree Co', 'ArborPro Tree Service', 'TreeLine Experts']
    };
    const businessNames = names[niche] || names['Pest Control'];
    return businessNames.map((name, i) => ({
      business_name: name, phone: `(${Math.floor(Math.random()*900)+100}) ${Math.floor(Math.random()*900)+100}-${Math.floor(Math.random()*9000)+1000}`,
      website: i % 3 === 0 ? `http://${name.toLowerCase().replace(/\s/g,'')}.com` : '',
      city, state: state || '', niche, rating: (Math.random() * 2 + 3).toFixed(1),
      reviews: Math.floor(Math.random() * 50) + 5, has_website: i % 3 === 0,
      address: `${Math.floor(Math.random()*9999)+100} Main St, ${city}`
    }));
  }

  // ==================== EXPORT ====================
  app.get('/api/export/csv', (req, res) => {
    const leads = queryAll('SELECT * FROM leads ORDER BY created_at DESC');
    const h = ['ID','Business','Owner','Phone','Email','City','Niche','Status','Assigned','Demo Sent','Meeting','Deal Value','Created'];
    const rows = leads.map(l => [l.id,l.business_name,l.owner_name,l.phone,l.email,l.city,l.niche,l.status,l.assigned_to,l.demo_sent?'Yes':'No',l.meeting_date,l.deal_value,l.created_at]);
    const csv = [h.join(','), ...rows.map(r => r.map(c => `"${c||''}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
    res.send(csv);
  });

  // ==================== SERVE FRONTEND ====================
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else { next(); }
  });

  app.listen(PORT, () => {
    console.log(`\n  ╔═══════════════════════════════════════════════╗`);
    console.log(`  ║  Stellars CRM v2.0 - Power Scraper Edition    ║`);
    console.log(`  ║  http://localhost:${PORT}                        ║`);
    console.log(`  ║  Database: SQLite (sql.js)                    ║`);
    console.log(`  ║  Scraper: Google Maps + Yelp + YellowPages    ║`);
    console.log(`  ╚═══════════════════════════════════════════════╝\n`);
  });
}

start().catch(console.error);
