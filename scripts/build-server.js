import { createServer } from 'http';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = 5174;
const STORAGE_KEY = 'roi-planner-v1';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/build') {
    try {
      const body = await readBody(req);
      const { storeData } = JSON.parse(body || '{}');

      execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });

      const distFile = join(ROOT, 'dist', 'index.html');
      if (!existsSync(distFile)) {
        res.writeHead(500);
        res.end('Build succeeded but dist/index.html not found');
        return;
      }

      let html = readFileSync(distFile, 'utf8');

      // Inject a bootstrap script that seeds localStorage before the app loads.
      // We insert it as the very first script in <head> so it runs before Zustand hydrates.
      if (storeData) {
        const escaped = JSON.stringify(storeData).replace(/</g, '\\u003c');
        const bootstrap = `<script>try{localStorage.setItem(${JSON.stringify(STORAGE_KEY)},${escaped});}catch(e){}</script>`;
        html = html.replace('<head>', '<head>' + bootstrap);
      }

      const buf = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Disposition': 'attachment; filename="ROI_Planner.html"',
        'Content-Length': buf.length,
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(500);
      res.end('Build failed: ' + err.message);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Build server listening on http://localhost:${PORT}`);
});
