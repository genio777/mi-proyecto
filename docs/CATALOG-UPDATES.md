# Actualización de catálogos, versión 0.1.4

Mejora del 16 de noviembre de 2026. OPI conserva `87dc5113a816939ef259203235f53de066871359`.

## Problema y comportamiento

El APK anterior solo leía los archivos incluidos al compilarlo. Una publicación posterior de nuevos cargadores en la web no renovaba esa instalación Android. La nueva fuente de datos permite consultar los JSON públicos de `https://genio777.github.io/mi-proyecto/` sin incorporar claves ni llamar a REVE desde el dispositivo.

El arranque nativo muestra la última copia local válida o el catálogo empaquetado. Después comprueba España y las referencias de tarifas en segundo plano. Las copias recientes se reutilizan durante una hora; la revisión se programa según su edad y se aplaza si la aplicación está oculta o está calculando una ruta. Volver a primer plano permite comprobar una revisión vencida. El botón «Actualizar catálogos» fuerza la consulta de esos dos recursos.

La pantalla Seguridad muestra qué datos se utilizan: publicación descargada, copia guardada o archivo incluido. Se distinguen fecha indicada por la fuente, descarga e intento de actualización. La fecha de importación y las comprobaciones de precios originales permanecen intactas; recibir el archivo hoy no acredita que una estación tenga una tarifa vigente, sea gratuita o esté libre.

## Países internacionales y viajes

Los archivos por país se descargan al consultar una zona o recuperar favoritos, con caché y la misma validación de país, conteos, coordenadas, atribución y licencia. Los resultados antiguos de un país se reemplazan al cargar su nueva instantánea; una estación retirada no se conserva mediante una simple unión de listas.

Durante el cálculo del viaje, el APK lee las copias ya disponibles, sin añadir consultas de actualización que consuman el límite solicitado de cuatro segundos por cada cien kilómetros. El límite total del cálculo sigue siendo 45 segundos. La última copia publicada de un país y el archivo incluido no siempre coinciden con un índice más reciente: si no hay una instantánea compatible, se informa de cobertura incompleta en lugar de mezclar conteos o inventar puntos.

Una actualización nacional o de tarifas recibida durante el cálculo se mantiene pendiente. Al finalizar se aplica; si cambia la instantánea, se retira el resultado anterior y se solicita volver a calcular. Favoritos, perfiles y puntos personales no se reemplazan por actualizar catálogos.

## Validación y conservación

Solo se admiten los archivos concretos de España, tarifas, índice internacional y códigos de país de dos letras. El origen publicado es fijo. Antes de guardar se valida el JSON y, para países, también la compatibilidad con el manifiesto que utiliza el consumidor.

HTTP fallido, HTML en lugar de JSON, datos malformados o timeout conservan la última copia compatible o utilizan el archivo incluido. La cancelación del solicitante se propaga y no continúa con un resultado de respaldo. La descarga tiene límite de doce segundos y la revisión de España/tarifas, veinte segundos en total. Las búsquedas internacionales conservan sus propios límites y señales de cancelación.

La caché pública utiliza CacheStorage del WebView, separada de los ajustes personales y excluida de la copia JSON de usuario. Los reemplazos de cada archivo son atómicos. Si el almacenamiento falta, se llena o una escritura sigue pendiente, los datos descargados pueden mostrarse con aviso de que no se han guardado. Una barrera conserva la escritura real pendiente tras un timeout para impedir que una respuesta antigua sobrescriba otra copia posterior.

Las copias no son un archivo permanente: el sistema puede eliminarlas por falta de espacio o al desinstalar. El APK conserva su instantánea empaquetada. Las condiciones y licencias de las fuentes siguen siendo las de cada registro.

## Comprobaciones

Las pruebas del motor cubren actualización, caché, pérdida de red, respuesta inválida, cancelación, timeout, límites de almacenamiento, rechazo de fechas anteriores y escrituras tardías no cancelables. Las pruebas del cargador internacional comprueban validación previa al guardado, TTL, invalidación y descargas compartidas.

Los flujos de navegador comprueban refresco sin perder ajustes, conservación ante errores y aplicación aplazada durante un viaje. Las pruebas Android utilizan CacheStorage y WebView reales, reapertura de actividad y descarga desde la publicación pública para comprobar CORS/TLS, además de los flujos nativos ya existentes. Los resultados concretos se conservan en los artefactos de Actions.

## Límites que permanecen

Esto actualiza datos, no el ejecutable instalado. La firma persistente de distribución sigue pendiente y los APK antiguos no admiten actualización directa con un certificado distinto. REVE continúa autenticándose exclusivamente en Actions; no hay renovación automática de credenciales documentada. Tampoco se incorpora disponibilidad en tiempo real, tráfico, meteorología o lectura automática del SOC.
