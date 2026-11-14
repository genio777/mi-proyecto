# Fiabilidad y datos personales, versión 0.1.3

Revisión del 14 de noviembre de 2026. Rama de trabajo independiente; OPI conserva `87dc5113a816939ef259203235f53de066871359`.

## Correcciones comprobables

- Una estación con CCS de 350 kW y Tipo 2 de 22 kW conserva la toma AC al limitar los cargadores a 50 kW. El filtro se aplica a la potencia nominal de cada toma antes de elegirla; el consumo y la curva respetan después los límites del vehículo. Más rápido sigue exigiendo al menos 100 kW compatibles y omitiendo el máximo opcional.
- El cálculo conserva la toma elegida para tarifas de referencia, tiempo de carga, fichas y marcador de parada. Una toma AC no hereda la tarifa HPC ni la potencia CCS de la misma estación.
- Cambiar vehículo, SOC, destinos, conectores o tarifas tras un resultado retira ese resultado y pide volver a calcular. Se conserva también la cancelación de cálculos activos.
- Los mapas que se retiran al editar una ruta detienen pan y desplazamiento y no programan transiciones de zoom pendientes. Evita callbacks de Leaflet sobre paneles destruidos al recalcular rápidamente.
- La selección del corredor maneja el cruce de ±180° sin recorrer Greenwich por una interpolación incorrecta. Las coordenadas utilizadas para consultar el proveedor de carretera permanecen en su sistema original.
- Los ajustes locales se validan antes de usarse. Un JSON con tipos incorrectos o almacenamiento denegado no debe impedir el arranque; el fallo de persistencia se informa.
- Favoritos incluye los puntos personales y puede recuperar las fichas internacionales desde el país correspondiente al abrir la pestaña tras un reinicio. Un identificador sin ficha no se convierte en una estación inventada ni desaparece de la lista guardada.
- Las aportaciones comunitarias se validan antes de renderizar campos y no adquieren evidencia oficial. Los enlaces de comentario se construyen con el número de incidencia de este repositorio. Las consultas tienen un tiempo máximo y permiten reintentar errores.
- La página de privacidad describe el comportamiento disponible y los servicios externos utilizados. Se eliminan afirmaciones de passkeys, biometría o lecturas BMS que no están implementadas.

## Copia y restauración

La copia usa un esquema versionado y una lista cerrada de ajustes personales. Incluye favoritos, puntos locales, perfiles y conectores por vehículo, filtros, SOC/reserva, tarifas manuales y la simulación guardada. Es necesario guardar los cambios de perfil y simulador que se quieran conservar antes de exportar.

No incluye los catálogos importados, la caché de geocodificación, credenciales ni telemetría. El archivo sí contiene ubicaciones personales. Los puntos restaurados se normalizan como aportaciones sin verificar, sin precio confirmado, disponibilidad ni licencia inventados; no se añaden a las rutas.

La web descarga JSON. Android utiliza los plugins oficiales de Capacitor Filesystem y Share para escribir en caché privada y abrir el selector nativo, sin pedir acceso general al almacenamiento. Abrir el selector o iniciar una descarga no demuestra que el usuario haya guardado una copia: la interfaz pide comprobarlo.

La importación limita el archivo a 2 MB y rechaza formatos, versiones, campos o valores no admitidos antes de escribir. La vista previa muestra recuentos y la restauración solo se ejecuta al pulsar su botón. Los ajustes ausentes de la copia se conservan. Si una escritura falla, se intenta recuperar la instantánea anterior; si esa recuperación también falla, se informa expresamente. El almacenamiento local no ofrece transacciones entre varias claves.

Esta función protege las instalaciones que ya la incluyen. No permite extraer por sí sola los datos del APK anterior, que carecía de exportación.

## Verificación

Las pruebas de Node cubren filtrado por toma, reserva, antimeridiano, datos personales malformados, compatibilidad de perfiles anteriores, exclusión de datos no portables y fallos de escritura/recuperación. Las pruebas Chromium comprueban exportación real como descarga, vista previa/restauración, arranque con datos dañados o almacenamiento denegado, recálculo al editar un viaje y aportaciones con campos inválidos.

```bash
npm test
npm run typecheck
npm run build
npm run validate:build
npm run test:browser
```

El workflow Android añade ejecución de la aplicación empaquetada en un emulador API 35 con KVM. Sus aserciones consultan el DOM real del WebView y el puente de Capacitor; no sustituye el catálogo empaquetado por fixtures HTTP. Una comprobación adicional valida que el informe contenga todas las pruebas esperadas, sin fallos ni omisiones. Los informes y diagnósticos se suben a `android-runtime-report`.

## Pendientes

La firma Android sigue siendo de depuración y cambia entre runners. Se ha comprobado que el certificado difiere del APK anterior y bloquea la actualización directa. Una nueva firma persistente permitiría futuras actualizaciones, pero no recuperaría la clave anterior. La conexión actual devuelve HTTP 403 para gestionar secretos de Actions, por lo que no se ha provisionado un almacén de firma ni se han publicado claves privadas. No se recomienda desinstalar una instalación con datos necesarios sin disponer antes de una copia recuperable.

El emulador no certifica GPS, Bluetooth, carga física ni comportamiento en todos los dispositivos. Se mantienen los límites de cobertura, evidencia de precios, restricciones fronterizas y servicios públicos descritos en [PLANNER-PERFORMANCE.md](PLANNER-PERFORMANCE.md) y [DEVELOPMENT-REPORT.md](DEVELOPMENT-REPORT.md). La renovación de la clave REVE continúa dependiendo del procedimiento oficial, sin endpoint automático documentado.
