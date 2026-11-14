import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Keep the installed APK identifiable and its version code increasing with fixes.
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Versión Android no válida');
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;
if (minor > 99 || patch > 99 || !Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) throw new Error('Código de versión Android fuera de rango');
const gradlePath = path.join(root, 'android/app/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) throw new Error('No se encontró la versión en Gradle');
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode).replace(/versionName\s+"[^"]*"/, 'versionName "' + version + '"');
writeFileSync(gradlePath, gradle);
if (!gradle.includes('testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"')) throw new Error('Falta el runner de instrumentación Android');
const androidTestSource = path.join(root, 'android-tests/java');
const androidTestDestination = path.join(root, 'android/app/src/androidTest/java');
if (!existsSync(androidTestSource)) throw new Error('Faltan las pruebas de ejecución Android');
mkdirSync(androidTestDestination, { recursive: true });
cpSync(androidTestSource, androidTestDestination, { recursive: true });
console.log('Android sincronizado:', version, '(código ' + versionCode + '); permisos GPS y pruebas de instrumentación preparados. Compila con ./android/gradlew -p android assembleDebug');
