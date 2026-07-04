const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = 8080;
const file = path.join(__dirname, 'index.html');

http
  .createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(file, 'utf8'));
  })
  .listen(port, () => console.log(`Test page: http://localhost:${port}`));
