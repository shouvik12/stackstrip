// Builds demo/index.html: one self-contained page (engine + sample logs inlined) for GitHub Pages.
// Usage: node scripts/build-demo.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const samples = {
  java: read('samples/java-spring.log'),
  python: read('samples/python-fastapi.log'),
  node: read('samples/node-express.log'),
  dotnet: read('samples/dotnet.log'),
  terminal: read('samples/terminal.log'),
};
const engine = read('src/engine.js').replace(/<\/script/gi, '<\\/script');
const html = read('demo/template.html')
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__SAMPLES__*/', () => JSON.stringify(samples).replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(root, 'demo/index.html'), html);
console.log('demo/index.html', (html.length / 1024).toFixed(1) + ' KB');
