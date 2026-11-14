# Carga Gratis España Jpaz

PWA y aplicación Android para consultar cargadores, comparar costes orientativos y planificar viajes con uno, dos o tres destinos.

**Aplicación publicada:** https://genio777.github.io/mi-proyecto/

**Compilaciones y APK:** https://github.com/genio777/mi-proyecto/actions

La rama `OPI` es la versión estable de recuperación. Este desarrollo parte de `main` en una rama independiente y no escribe en OPI.

## Aviso de uso y responsabilidad

El inicio muestra el aviso aprobado por el titular antes del mapa. El enlace permanente «Aviso legal» abre el mismo texto dentro de la aplicación, también sin conexión una vez cargada y en el APK. Explica el carácter gratuito e informativo, los posibles errores y la responsabilidad del autor en la medida permitida por la legislación aplicable. No exige aceptar una renuncia ni sustituye la comprobación de datos con el operador.

Las paradas del viaje distinguen precio confirmado, estimado o desconocido, fecha indicada por la fuente y disponibilidad sin confirmar en tiempo real. Una fecha de importación no se presenta como fecha de verificación. La replanificación requiere actualizar los datos y volver a pulsar «Calcular ruta».

## Planificador y vehículos

- **Más rápido** exige una toma compatible de al menos 100 kW y omite el máximo opcional de otros modos. Una estación de 350 o 400 kW sigue siendo candidata; la carga efectiva se limita por el coche y su curva de carga estimada.
- Compara tiempo de carretera, desvíos, carga parcial y conexión. Mantiene batería y reserva entre hasta tres destinos, permite regresar por la misma estación y valida los tramos finales.
- Tesla Model Y Standard Range europeo: CCS2 y Tipo 2, perfil hasta 170 kW DC y 11 kW AC. Renault Zoe R90: Tipo 2 hasta 22 kW AC, sin DC. Son límites del perfil, no potencias garantizadas ni especificaciones de otras variantes.
- La búsqueda usa un corredor y alternativas seleccionadas por tramo, con pasos conservadores de energía. No garantiza el óptimo global. No incluye tráfico, esperas, clima ni restricciones de frontera.
- OSRM público es un servicio de demostración, limitado aquí a una solicitud por segundo. Para producción/configurar otro servidor compatible: `VITE_ROUTING_BASE_URL` al compilar.
- La búsqueda de recargas se limita según los kilómetros reales de carretera: 100 km → 4 s, 500 km → 20 s, hasta 45 s. Empieza al conocer la ruta base; el cálculo completo, incluidas direcciones, tiene un límite total de 45 s y botón de cancelación. Un plazo agotado no se presenta como viaje imposible. Detalles y mediciones: [PLANNER-PERFORMANCE.md](docs/PLANNER-PERFORMANCE.md).

## Fuentes y cobertura

España se importa desde [DGT/MITERD](https://nap.dgt.es/dataset/puntos-de-recarga-electrica-para-vehiculos). La cobertura internacional procede de la [exportación oficial de Open Charge Map](https://github.com/openchargemap/ocm-export), separada por países y cargada bajo demanda. La importación examina los códigos de Europa, Asia y Rusia admitidos por el proyecto; un país sin registros utilizables no se presenta como cubierto.

Cada registro OCM conserva fuente, proveedor, licencia, potencia por toma y fecha declarada. Solo se admiten licencias revisadas. El manifiesto `data/international/index.json` detalla países, recuentos y ausencias; la importación conserva también el commit de origen. El control geográfico aproximado usa componentes de [Natural Earth, dominio público](https://www.naturalearthdata.com/about/terms-of-use/), con margen amplio para descartar errores evidentes de país/coordenadas; no valida fronteras exactas ni ubicaciones presenciales.

Los datos de conectores GB/T, NACS o CCS1 pueden conservarse como inventario, pero no se consideran compatibles con los dos perfiles europeos. Los registros con acceso privado o membresía se excluyen conservadoramente de las rutas. La disponibilidad nunca se deduce de la importación.

La búsqueda explícita de ciudades, direcciones y códigos postales usa Photon/OSM. Un código postal numérico ambiguo requiere país o localidad. Endpoint público configurable en `public/geocoding-config.json`; condiciones y límites en [GEOCODING.md](docs/GEOCODING.md).

## REVE y precios

La sincronización autenticada de REVE se ejecuta exclusivamente en GitHub Actions. Configura la clave oficial como secreto de repositorio `REVE_API_KEY` en **Settings → Secrets and variables → Actions**. Nunca debe ser una variable `VITE_*`, un archivo público o un dato introducido en el chat.

La fecha de caducidad comunicada es **29/10/2027**, inclusive en Madrid; puede configurarse con la variable de Actions `REVE_API_KEY_EXPIRES_ON`. Hay control diario y avisos de caducidad, conservando la caché si la clave falta, caduca o REVE rechaza el acceso. La API pública no documenta renovación automática de credenciales. Instrucciones y límites: [REVE-AUTONOMY.md](docs/REVE-AUTONOMY.md).

Contrato oficial: https://www.mapareve.es/api/external/v1/docs/api-docs.json . La integración mantiene inventario estático y cursor, reserva un presupuesto conservador de cuatro consultas por hora antes de contactar con REVE, conserva la reserva aunque falle la compilación y respeta respuestas 429. La caché solo contiene datos normalizados públicos. Sin clave o sin reserva duradera confirmada, conserva los datos anteriores y declara el estado.

- Precio desconocido se almacena como `null`; no significa cero.
- Una declaración comunitaria «Free» se muestra como texto de la fuente, sin convertirla automáticamente en gratuidad verificada.
- Los precios individuales requieren evidencia de estación, toma, impuestos, condiciones y vigencia. La lista actual de precios verificados está vacía.
- Las referencias españolas por operador y los valores manuales son hipótesis identificadas. No se aplican automáticamente tarifas españolas a estaciones extranjeras; el precio manual internacional se expresa como hipótesis en EUR/kWh.
- Los precios y plazas disponibles de REVE no se presentan como recibidos en directo. Los endpoints dinámicos requieren integración y verificación adicionales.

## Desarrollo y comprobaciones

Node 22 o posterior y Java 21 para Android. Instala Android SDK 35 para compilar el APK.

```bash
npm ci
npm run prepare:catalog
npm run dev
npm test
npm run typecheck
npm run build
npm run validate:build
npx playwright install chromium
npm run test:browser
node scripts/prepare-android.mjs
cd android && ./gradlew assembleDebug
```

`prebuild` y `predev` restauran el HTML fuente: el `index.html` de la raíz de `main` es un artefacto publicado. El script Android crea/sincroniza Capacitor y declara permisos GPS de forma idempotente. El APK de depuración se genera en `android/app/build/outputs/apk/debug/app-debug.apk`.

Las pruebas usan datos sintéticos solo en fixtures. Existe además una prueba de navegador con el catálogo publicado real. Los workflows de PR verifican web y compilan Android sin recibir secretos. Pages se actualiza cada diez minutos cuando Actions puede ejecutarlo; el catálogo OCM se refresca en un flujo diario independiente con lotes rotativos de seis países. Estas frecuencias no garantizan datos en tiempo real.

Los flujos que actualizan `main` comparten exclusión mutua, recuperan su cabecera actual y rechazan sobrescribir un cambio posterior. Una publicación fallida conserva la última versión disponible.

Los resultados concretos y pendientes de esta revisión se recogen en [DEVELOPMENT-REPORT.md](docs/DEVELOPMENT-REPORT.md).
