# Informe de desarrollo y verificación

Verificado el 13 de noviembre de 2026. Cambios en la rama `codex/international-planner-verification`, basada en `main`. OPI conserva el commit `87dc5113a816939ef259203235f53de066871359`; no se ha escrito en esa rama.

La fase inicial y sus pruebas se verificaron en `c139bea5b573c98cfcce40539832b6dbc143f24d`. La fase posterior de autonomía REVE se detalla al final de este informe.

## Cambios y comportamiento

El modo Más rápido admite tomas compatibles de 100 kW o más sin aplicar el máximo opcional de otros modos. La potencia nominal del poste puede superar la del vehículo: la carga estimada respeta el límite del coche. El perfil europeo Model Y Standard Range admite CCS2/Tipo 2, hasta 170 kW DC y 11 kW AC; Zoe R90 solo Tipo 2 AC hasta 22 kW. La potencia de un CCS de 350 kW no se atribuye a una toma AC de la misma estación ni determina su tarifa orientativa.

El motor común mantiene SOC y reserva entre uno, dos o tres destinos, permite carga parcial, estaciones repetidas e itinerarios con más de 40 paradas. Usa distancias y duraciones por carretera, incluye desvíos y conexión, y vuelve a validar consumo y geometría elegidos. Los errores, límites de búsqueda y falta de conexión por carretera se muestran como tales. No se dibujan rutas inventadas tras un fallo.

Se conserva el simulador de costes, guardado/restauración, CSV, favoritos, filtros, mapa, GPS y perfiles individuales. Las aportaciones personales se mantienen locales y no se promueven a precios oficiales. Las referencias españolas no se trasladan automáticamente a otros países. Una declaración comunitaria «Free» no convierte un precio desconocido en cero. La fila de coste cero del comparador se identifica como hipótesis, sin presentarla como gratuidad verificada. Comprobar la accesibilidad de una URL no renueva la fecha de sus precios: se registra una fecha independiente de comprobación de fuente.

La búsqueda internacional deja de forzar España para códigos postales de cinco cifras. Usa consultas explícitas, caché, control de concurrencia y cancelación de respuestas antiguas. Los códigos postales numéricos ambiguos requieren país o localidad.

Los importadores internacionales conservan licencias por proveedor, fuente, referencia y potencia por toma. Los países se cargan bajo demanda en mapa, búsqueda y corredor del viaje. Se corrige OCM 1036 a Tipo 2 cable y se conservan conectores internacionales sin hacerlos compatibles artificialmente con los coches europeos. Se excluyen importaciones Tesla sin licencia o conectores respaldados y el punto Lidl cuya ubicación se había aproximado a una calle.

REVE mantiene inventario estático normalizado, cursor y reconciliación de bajas únicamente tras un ciclo completo. El presupuesto se reserva y confirma en Actions antes de consultar, permanece entre fallos y se respetan respuestas 429. La clave solo llega como secreto de Actions; un control bloquea su presencia en archivos públicos sin imprimirla.

Los workflows usan dependencias bloqueadas, prueban la web y compilan Android en PR. Los procesos que publican en `main` comparten exclusión mutua, leen su cabecera actual y rechazan sobrescribir un cambio posterior. La importación internacional diaria ya no depende de que Actions arranque en un minuto exacto. Web y Android recuperan la misma instantánea por países.

## Importaciones reales

| Comprobación | Resultado |
| --- | --- |
| DGT/MITERD DATEX II | 12.001 registros nacionales válidos, con potencia por toma |
| Exportación oficial OCM | 154.160 registros examinados; 126.933 admitidos |
| Alcance OCM examinado | 103 códigos Europa/Asia/Rusia; 88 con archivos fuente; 79 con registros utilizables |
| Rechazados OCM | 13.417 sin conector/potencia utilizable; 10.084 por licencia no admitida; 3.660 por estado no operativo; 66 por coordenadas incompatibles con su país |
| Precios individuales verificados | 0; los precios importados permanecen `null` |
| RIPREE | HTTP 200 con HTML en lugar de CSV; rechazado sin modificar el catálogo |
| REVE autenticado | Pendiente: el último workflow del repositorio recibe `REVE_API_KEY` vacía |

Los recuentos son registros de fuente, no un censo de estaciones físicas únicas: pueden existir duplicados entre DGT y OCM. Los 79 países incluyen España. La cobertura en Asia es especialmente irregular y no se presenta como completa.

OCM se importó del commit [`8e3bedca48ca94807d96b2f5e7ee02cffe63ae54`](https://github.com/openchargemap/ocm-export/commit/8e3bedca48ca94807d96b2f5e7ee02cffe63ae54). Cada archivo de país conserva ese origen. El manifiesto de cobertura es [`data/international/index.json`](../data/international/index.json).

Sin carpeta en la fuente: BD, BN, BT, KP, KW, LA, LB, MN, MV, SY, TJ, TL, TM, VA, YE. Sin registros utilizables tras controles: AF, AM, BH, MC, NP, OM, SG, SJ, UZ.

El único registro OCM atribuido a Afganistán estaba situado en Alemania y fue rechazado. El control aproximado usa cajas de componentes geográficos de Natural Earth, con margen de 1°. Admite islas, Ceuta, Canarias y ambos lados del antimeridiano ruso. No certifica una posición exacta ni resuelve disputas fronterizas. Su fuente y licencia de dominio público se conservan en `scripts/data/country-bounds.json`.

## Pruebas automáticas y navegador

- **85 pruebas automáticas aprobadas**, sin omisiones: compatibilidad por toma, carga parcial, SOC fraccionario, tres destinos, más de 40 paradas, repetición de estaciones, tiempos de desvío, matrices incompletas, errores HTTP/timeout, precios condicionados/caducados, licencias, restauración y bajas de catálogo, presupuesto REVE entre procesos y rechazo de secretos en archivos públicos.
- **Ocho pruebas Chromium aprobadas** sobre Vite compilado: mapa/favoritos, perfiles independientes, simulador/CSV, búsqueda internacional, descarga de países y licencias, Más rápido con CCS 400 kW pese a techo guardado de 50 kW, tres destinos y fallo del proveedor.
- La octava prueba utiliza el catálogo real: 2.121 registros de Rusia; 217 dentro de 15 km de las coordenadas de Moscú. Se comprueban fichas, fuente, licencia y precios desconocidos sin errores JavaScript.
- `npm run typecheck`, `npm run build`, `npm run validate:build`, `git diff --check` y `actionlint` aprobados. La compilación valida todos los archivos por país y sus licencias, potencias y recuentos.

Las demás pruebas de navegador usan fixtures sintéticos identificados exclusivamente en los tests. No constituyen datos de producción ni pruebas de disponibilidad de una estación.

## Pruebas reales de búsqueda y viaje

Photon devolvió resultados comprobados para 75001 París Francia; 10115 Alemania; 1012 AB Países Bajos; Москва Россия; 100-0001 Japón; y Unter den Linden 2 Berlin. Coordenadas y términos se detallan en [`GEOCODING.md`](GEOCODING.md).

El servicio real OSRM devolvió geometrías de Madrid–París, París–Berlín, Berlín–Moscú y Moscú–Pekín. Una geometría devuelta no confirma permiso de acceso, pasos fronterizos, ferris ni viabilidad legal del trayecto.

El viaje completo **París → Bruselas → Ámsterdam → Berlín** se calculó con estaciones reales y perfil Model Y, reserva del 15 %:

| Magnitud | Resultado |
| --- | --- |
| Carretera y desvíos | 1.185,53 km |
| Conducción | 810,73 minutos |
| Carga y conexión | 105,98 minutos |
| Total estimado | 916,71 minutos |
| Recargas | 5; todas con precio desconocido |
| SOC en los tres destinos | 44,67 % · 34,99 % · 15,75 % |
| Resolución en servicio público | 225 segundos; 152 grupos de tramos comprobados |

Se revalidaron después los ocho tramos elegidos con el proveedor final y el consumo de sus geometrías. Estaciones OCM: FR-211285, NL-132377, NL-301738, DE-132132 y DE-113337. Esto verifica un cálculo real, no el funcionamiento presencial de esas estaciones.

## Android

Compilación real final con Java 21, Android SDK 35, Capacitor y Gradle: **`BUILD SUCCESSFUL in 36s`**.

- APK de depuración de 22.146.529 bytes; identidad `es.cargagratis.app`, nombre correcto y permisos GPS coarse/fine e Internet.
- Firma válida y ZIP sin errores CRC; 12.001 registros nacionales, 126.933 OCM, 88 archivos por país y 265.371 potencias por toma válidas.
- Los **105 archivos** de la compilación web coinciden byte a byte con los incluidos en el APK. Preparación Android repetida sin duplicar permisos.
- SHA-256 del APK local: `144f25f9906b6ebc206b421ef5005a84a2c006efa0d808b27958b1970d393f02`.

La firma de depuración puede cambiar en otro entorno; el artefacto de Actions tendrá su propia firma y hash. No se ha ejecutado el APK en dispositivo físico ni emulador.

## Pendientes y límites

1. Configurar la clave oficial como secreto `REVE_API_KEY` de GitHub Actions y verificar una consulta autenticada. No se solicita ni publica la clave en el chat. Los endpoints dinámicos de precios/ocupación siguen sin integrarse; no se presentan como recibidos en directo.
2. Probar instalación y ejecución Android, GPS, permisos y recuperación de red en dispositivo o emulador. La compilación y el paquete sí están comprobados.
3. La cobertura no es exhaustiva: faltan países o registros con licencia/potencia utilizable. No se rellenan esos huecos con datos inventados. Los datos comunitarios pueden estar desactualizados; acceso privado y membresías se excluyen conservadoramente del planificador.
4. Sustituir los servicios públicos Photon/OSRM por servicios con capacidad y condiciones adecuadas para producción. El límite por cliente no controla tráfico agregado. La optimización usa un corredor y selección de alternativas, por lo que no garantiza el óptimo global.
5. Chromium del entorno rechaza la CA del proxy al descargar mosaicos OSM (`ERR_CERT_AUTHORITY_INVALID`). Los marcadores, catálogo y fichas reales se verificaron; el fondo cartográfico externo no se da por comprobado. Una descarga identificada con curl y TLS verificado sí respondió con PNG. No se desactivó TLS para hacer pasar la prueba.
6. No hay precios individuales verificados en la lista actual. Se mantienen estimaciones diferenciadas y datos desconocidos; no se afirma gratuidad ni plaza libre por defecto.

## Fase posterior: acceso, caducidad y autonomía REVE

Tras comunicar el titular la fecha de caducidad del 29/10/2027, se añadieron controles de fecha en Madrid, avisos 60/30/7 días, bloqueo de consultas caducadas conservando caché, estado explícito para HTTP 401/403 y presentación de estos estados en la aplicación. Se incorporó una sonda de una consulta autenticada que se ejecuta exclusivamente desde Actions y un control diario sin consultar REVE.

Se verificaron 126 pruebas automáticas, TypeScript, Vite y la validación completa del catálogo. La sonda se prueba con fixtures; una autenticación real requiere que el secreto esté guardado en GitHub. La conexión disponible para esta sesión devuelve HTTP 403 al acceder a la gestión de secretos, por lo que no ha permitido guardar la clave desde la sesión. Ningún valor de clave se ha incorporado al código o a este informe.

La documentación oficial no publica renovación de credenciales. Los avisos anticipados y la sincronización no se presentan como renovación automática. Procedimiento y estados en [REVE-AUTONOMY.md](REVE-AUTONOMY.md).
