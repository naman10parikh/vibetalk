#!/usr/bin/env node

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const PORT = 3000;

function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  
  if (url === '/' || url === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    serveFile(res, indexPath, 'text/html');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Vibe Talk Web Interface running at http://localhost:${PORT}`);
  console.log('🎙️ Open this URL in your browser for visual feedback while using voice commands!');
});

export { server }; 