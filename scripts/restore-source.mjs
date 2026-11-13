import fs from 'node:fs';
// main/index.html is a published artifact. Always build the actual source.
fs.copyFileSync(new URL('../source-index.html', import.meta.url), new URL('../index.html', import.meta.url));
