const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});
server.listen(8080, '0.0.0.0', () => {
  console.log('Running on 8080');
});
