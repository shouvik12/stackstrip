// Local HTTPS mock of an AI chat page. Chrome maps claude.ai / chatgpt.com / gemini.google.com to it.
// Makes a throwaway self-signed certificate on first run (needs openssl).
const https = require('https'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const dir = path.join(require('os').tmpdir(), 'stackstrip-mock-cert');
function cert() {
  fs.mkdirSync(dir, { recursive: true });
  const key = path.join(dir, 'key.pem'), crt = path.join(dir, 'cert.pem');
  if (!fs.existsSync(key)) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '30', '-subj', '/CN=localhost']);
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}
function start(port = 8443) {
  return new Promise((res) => {
    const s = https.createServer(cert(), (q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(path.join(__dirname, 'mock.html'))); });
    s.listen(port, () => res(s));
  });
}
module.exports = { start };
if (require.main === module) start().then(() => console.log('mock chat on https://localhost:8443'));
