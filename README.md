# CargaGratis España

Demo V1 de una aplicación para localizar cargadores gratuitos y planificar rutas de coste 0 €.

## Objetivo
Una única base de código para PWA y Android. La demo actual usa puntos ficticios claramente marcados como DEMO.

## Desarrollo
```bash
npm install
npm run dev
```

## Android
```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

App ID: `es.cargagratis.app`.

Próxima fase: incorporar fuentes reales de cargadores de España, fiabilidad/última verificación y cálculo energético de Ruta 0 €.
