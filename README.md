# CargaGratis España

Aplicación PWA de puntos de recarga en España. Código propio alojado en GitHub; no depende de Lovable.

## Datos reales
Cada compilación descarga el fichero público DATEX II de la DGT/MITERD (Mapa REVE) y genera `public/data/chargers-spain.json`. El proceso falla si encuentra menos de 5.000 estaciones, para evitar publicar un catálogo aparentemente válido pero incompleto.

Fuente: https://nap.dgt.es/dataset/puntos-de-recarga-electrica-para-vehiculos

**Limitaciones:** la fuente no facilita precios ni ocupación en tiempo real. Esos campos se muestran como desconocidos; no se presume gratuidad. La fecha de importación no equivale a la fecha de verificación de cada estación.

## Automatización
`.github/workflows/pages.yml` ejecuta diariamente el importador y compila la PWA para GitHub Pages. Se puede ejecutar manualmente en GitHub > Actions. GitHub Pages debe estar habilitado para publicar desde GitHub Actions.

## Desarrollo local
```bash
npm install
node scripts/import-national.mjs
npm run build
npm run dev
```

## Android
```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```
ID: `es.cargagratis.app`.

## Estado funcional y límites
El mapa utiliza estaciones reales importadas y el GPS. El planificador calcula una ruta base con OSRM y consumo orientativo, pero **no valida aún una secuencia de recargas alcanzables**, por lo que no afirma disponer de un itinerario de carga viable. El modo gratuito no inventa estaciones gratuitas. No hay integración activa de telemetría OBD.
