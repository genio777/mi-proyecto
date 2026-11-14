# Planificador: límites y comprobaciones de rendimiento

Versión 0.1.2, 14 de noviembre de 2026. La rama OPI permanece intacta.

## Presupuesto solicitado

La búsqueda de recargas empieza después de resolver las direcciones y conocer la suma de los kilómetros de carretera de todas las etapas. Su presupuesto es `ceil(km × 4 / 100)` segundos, con mínimo de 4 y máximo de 45. Se redondea al siguiente segundo entero.

| Ruta base | Presupuesto de búsqueda |
| --- | --- |
| 100 km | 4 s |
| 200 km | 8 s |
| 250 km | 10 s |
| 500 km | 20 s |
| 750 km | 30 s |
| 1.000 km | 40 s |
| 1.125 km o más | 45 s |

Existe además un límite total de 45 segundos desde el clic, que incluye direcciones, ruta base, carga de catálogos y validación final. Si la preparación consume tiempo, el presupuesto de búsqueda efectivo se reduce al tiempo restante. No es una promesa de respuesta satisfactoria dentro del plazo: si no se logra confirmar el viaje completo, se interrumpe, se explica y se permite reintentar. Una interrupción no demuestra que el viaje sea imposible.

La pantalla muestra el tiempo transcurrido y, al conocer la distancia, el presupuesto efectivo. «Cancelar cálculo» interrumpe tanto consultas en espera como consultas activas y búsqueda local. Cambiar los datos del viaje también cancela; las respuestas antiguas no pueden reemplazar otro resultado. El reloj se actualiza en un componente independiente para evitar recorrer todo el catálogo cada segundo.

## Correcciones

- Las matrices de carretera agrupan orígenes y destinos y conservan su dirección. Con hasta 50 coordenadas únicas entre todas las etapas se comparte una sola matriz. Las matrices mayores se dividen sin aumentar el máximo de coordenadas por consulta.
- La validación final utiliza una ruta con todos los puntos y comprueba la reserva en cada tramo. Se mantienen los destinos obligatorios y la batería entre etapas.
- Se conserva el límite compartido de una consulta por segundo al servidor OSRM público y un máximo de 20 consultas reales por cálculo. Los límites y errores no generan distancias ficticias.
- Si la autonomía basta para todo el recorrido, no se descargan catálogos para buscar recargas innecesarias.
- Los catálogos incluyen celdas geográficas de un grado. Así, una caja de país grande no obliga a cargar archivos ajenos al corredor. La importación regenera estas celdas a partir de las coordenadas existentes, sin alterar estaciones ni fuentes.
- La carga internacional comparte descargas con un máximo de tres simultáneas. Cancelar un consumidor conserva los demás; cancelar el último interrumpe la descarga. Se pueden reintentar fallos y se conserva la caché completada.
- La búsqueda de direcciones libera su cola al cancelar durante la configuración del servicio, la petición o la lectura de la respuesta. No inicia una consulta tardía ni guarda coordenadas de una búsqueda cancelada.
- Se reutilizan cálculos de curvas de carga y se cede periódicamente el control al navegador para que los plazos y la cancelación respondan durante la exploración.

## Comprobaciones

El caso real reproducible usa París → Bruselas → Ámsterdam → Berlín, tres destinos, Tesla Model Y, modo Más rápido y reserva del 15 %. No se conoce todavía el itinerario exacto comunicado por el usuario.

Con los mismos puntos y estaciones seleccionadas, el motor anterior tardó aproximadamente 225 segundos; el corregido tardó 9,01 segundos, con nueve consultas OSRM reales: tres rutas base, cinco matrices y una validación final. Conservó cinco recargas y 1.185,53 km, con SOC de llegada de 44,67 %, 34,99 % y 15,75 %. Las cinco paradas tenían precio desconocido; no se les asignó gratuidad ni tarifa inventada.

Una comprobación completa en Chromium, con cuatro búsquedas Photon reales y catálogos reales de Francia, Bélgica, Países Bajos y Alemania, tardó 16,45 segundos desde el clic hasta el resultado. Las coordenadas resueltas por Photon produjeron 1.183 km y cinco recargas. Es una medición concreta; no garantiza tiempos de los proveedores ni reproduce el dispositivo del usuario.

Las pruebas automáticas comprueban presupuestos, cancelación durante cola/red/carga local, respuestas tardías, cambio de parámetros, matrices dirigidas, límites de coordenadas y consultas, reserva entre destinos y una ruta de 100 km con tres destinos y recarga que utiliza una matriz y una validación final. Los escenarios sintéticos están limitados a pruebas.

Para repetir la medición de CPU sin red ni credenciales:

```bash
node tests/benchmark-planner.mjs
```

Este programa etiqueta sus resultados como fixtures y prueba tres destinos con 5.000 estaciones sintéticas. Para las comprobaciones funcionales:

```bash
npm test
npm run typecheck
npm run build
npm run validate:build
npm run test:browser
```

El APK declara versión 0.1.2 y código 102. Se comprueban su compilación y recursos empaquetados; no se ha medido en un teléfono físico. El flujo actual genera APK de depuración con la firma del runner: una firma distinta puede impedir actualizar una instalación anterior. No debe recomendarse desinstalar sin proteger antes los datos locales. Una distribución Android con firma persistente requiere un almacén privado de firma conservado como secreto, nunca en archivos públicos.

La selección sigue limitada a alternativas del corredor y no prueba el óptimo global. No comprueba tráfico, colas ni restricciones fronterizas. Se mantienen los perfiles de vehículo, los estados de evidencia y el aviso legal ya aprobado.
