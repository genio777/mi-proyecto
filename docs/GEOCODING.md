# Búsqueda internacional

Las búsquedas de mapa y del planificador comparten `src/geocoding.mjs`. Se envían únicamente al pulsar Buscar zona, Enter o Calcular ruta; escribir no genera solicitudes. El proveedor por defecto es Photon, geocodificador internacional basado en OpenStreetMap.

- La API demo de Photon permite uso razonable en proyectos, limita o bloquea tráfico elevado y no ofrece garantías de disponibilidad: <https://github.com/komoot/photon#demo-server>.
- Contrato de búsqueda y filtro `countrycode`: <https://github.com/komoot/photon/blob/master/docs/api-v1.md>.
- Datos OpenStreetMap bajo ODbL y atribución visible en mapa y pie de página: <https://www.openstreetmap.org/copyright>.
- Política del anterior servicio público Nominatim: <https://operations.osmfoundation.org/policies/nominatim/>. No se utiliza como respaldo automático.

El cliente serializa solicitudes con al menos 1100 ms entre inicios y guarda resultados durante 30 días en el dispositivo. Este límite por cliente **no garantiza** un límite agregado de todos los usuarios. Para tráfico elevado se debe contratar o alojar una instancia Photon y establecer su URL HTTPS en `public/geocoding-config.json` (`photonEndpoint`). La configuración publicada se vuelve a leer en cada carga de la aplicación y no contiene secretos. El servidor elegido debe implementar el contrato Photon y permitir CORS desde la web y Android.

Los códigos postales numéricos sin país ni localidad son ambiguos: `10115, Alemania`, `75001, París, Francia` y `28013, España` sí se aceptan; `10115` pide más contexto. No se atribuyen automáticamente a España. Se reconocen también códigos completos neerlandeses, británicos y japoneses, nombres de países con acentos y alfabetos locales. Las coordenadas admiten latitud y longitud globales; con coma decimal se separan mediante punto y coma (`40,4168; -3,7038`).

La posición devuelta es la referencia del lugar o código postal del proveedor. No garantiza la ubicación exacta de una entrada o un cargador. Si el proveedor no devuelve resultados válidos dentro del país solicitado, se muestra el error y no se sustituye por otro país. Un fallo o límite HTTP no se convierte en una ausencia de cargadores.

## Verificación

Pruebas automáticas sin red: `node --test tests/geocoding.test.mjs`. Comprueban coordenadas, países y alfabetos, códigos postales ambiguos, contrato de consulta, validación del país y la respuesta, caché, serialización y cancelación.

Se realizaron consultas reales secuenciales a Photon el 13 de noviembre de 2026, con identificación de aplicación y más de 1100 ms entre inicios:

| Consulta | Latitud, longitud devueltas |
| --- | --- |
| 75001, París, Francia | 48.8556574, 2.3450512 |
| 10115, Alemania | 52.53219143513144, 13.384557071160947 |
| 1012 AB, Países Bajos | 52.378783245098035, 4.900100233333333 |
| Москва, Россия | 55.625578, 37.6063916 |
| 100-0001, Japón | 35.68473205, 139.752616325 |
| Unter den Linden 2, Berlin, Alemania | 52.5177477, 13.3970225 |

Estas consultas verifican ejemplos y el contrato observado; no prueban que todas las direcciones del mundo estén cubiertas. Los resultados pueden cambiar con los datos del proveedor.
