# Carga Gratis España Jpaz

Aplicación web progresiva (PWA) para consultar puntos de recarga de vehículos eléctricos en España, comparar costes orientativos y planificar viajes.

**Aplicación:** https://genio777.github.io/mi-proyecto/  
**Compilaciones:** https://github.com/genio777/mi-proyecto/actions

## Datos y transparencia

- Estaciones importadas desde el conjunto público DGT/MITERD (REVE): https://nap.dgt.es/dataset/puntos-de-recarga-electrica-para-vehiculos
- El catálogo nacional se importa durante el flujo de publicación y se valida antes de compilar.
- La fecha de importación no confirma el estado operativo, la ocupación ni el precio actual de una estación.
- Precio desconocido no significa precio cero; las tarifas por operador son orientativas y deben confirmarse antes de cargar.
- El comparador de costes permite simular importes fijos y por minuto. Esos parámetros son hipótesis introducidas por el usuario.
- Las rutas y estimaciones de consumo no sustituyen la comprobación de autonomía real, acceso y funcionamiento de la estación.

## Publicación y control de calidad

El flujo `.github/workflows/pages.yml` se ejecuta con cada cambio en `main`, manualmente y mediante una programación de **cada 10 minutos**. GitHub Actions puede retrasar o saltarse ejecuciones programadas; no es una garantía de actualización en tiempo real.

La publicación comprueba: catálogo nacional, estructura de precios, compilación Vite, archivos publicados, funciones críticas de ruta, identidad «Carga Gratis España Jpaz» y metadatos de instalación PWA. **Un cambio guardado no equivale a una compilación correcta:** verificar siempre el resultado en Actions.

La rama `OPI` es la referencia de recuperación y no debe sobrescribirse sin validación expresa.

## Instalación

**Android (PWA):** abrir la aplicación en Chrome y elegir «Instalar aplicación» o «Añadir a pantalla de inicio», cuando el navegador lo ofrezca.

**Desarrollo local:**

```bash
npm install
npm run build
npm run dev
```

**Android nativo (Capacitor, requiere entorno Android configurado):**

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Identificador técnico Android: `es.cargagratis.app`. El nombre visible es «Carga Gratis España Jpaz».

## Verificación manual previa al cierre

1. Abrir y recargar la PWA en Android y escritorio, también tras actualizar la versión.
2. Comprobar GPS, búsqueda, mapa y filtros de conectores.
3. Probar los perfiles Tesla y Zoe con los itinerarios ya validados; no cambiar la lógica de cálculo.
4. Verificar el comparador de costes, la recuperación de simulaciones y la exportación CSV.
5. Comprobar el funcionamiento sin conexión y al recuperar internet; la información de estaciones requiere red.
6. Confirmar el resultado de la última compilación y la instalación de la PWA.

**Estado:** versión candidata a cierre; pendiente de completar las pruebas manuales y confirmar una compilación correcta de la última revisión.
