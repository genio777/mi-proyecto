import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
if (!existsSync(path.join(root, 'dist/index.html'))) {
  throw new Error('Primero ejecuta npm run build: falta dist/index.html');
}
if (!existsSync(cli)) throw new Error('Primero instala las dependencias con npm ci');
function capacitor(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Capacitor ${args.join(' ')} falló: ${result.status}`);
}
if (!existsSync(path.join(root, 'android'))) capacitor('add', 'android');
capacitor('sync', 'android');

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
for (const permission of ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']) {
  if (!manifest.includes(`android:name="${permission}"`)) {
    if (!manifest.includes('<application')) throw new Error('AndroidManifest.xml sin application');
    manifest = manifest.replace('<application', `<uses-permission android:name="${permission}" />\n    <application`);
  }
}
writeFileSync(manifestPath, manifest);
console.log('Android sincronizado; permisos GPS declarados. Compila con ./android/gradlew -p android assembleDebug');
