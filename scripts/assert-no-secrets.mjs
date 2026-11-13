import fs from 'node:fs';
import path from 'node:path';
// The credential only enters the importer and this check through Actions env.
// Never include its value in an error or an artifact.
const secret = process.env.REVE_API_KEY;
if (secret) {
  function check(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) check(file);
      else if (fs.readFileSync(file).includes(Buffer.from(secret))) {
        throw Error('La compilación contiene una credencial REVE; publicación bloqueada');
      }
    }
  }
  check('public');
  check('dist');
  console.log('Credencial REVE ausente de archivos públicos');
} else console.log('Sin credencial REVE en este proceso; comprobación autenticada pendiente en Actions');
