const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
});
server.listen(3000, '0.0.0.0', () => {
  console.log('Test server running on port 3000');
});
