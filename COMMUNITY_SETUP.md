# Comunidad de cargadores gratuitos: coste 0 €

La aplicación usa **GitHub Issues** en el repositorio público genio777/mi-proyecto. No requiere Supabase ni base de datos externa.

## Activación
1. En GitHub, Settings > General > Features, comprobar que **Issues** esté activado.
2. Los usuarios abren la pestaña **Añadir gratis**, completan nombre, coordenadas GPS, potencia, conector e instrucciones y pulsan **Publicar cargador para toda la comunidad**.
3. Se abre GitHub con un Issue pre-rellenado. El usuario debe iniciar sesión y pulsar **Submit new issue**. Sin ese paso, el cargador **no está publicado**.
4. La pestaña consulta Issues públicos y muestra aportaciones con el bloque de datos `CARGAGRATIS_POINT`.
5. Para confirmar un punto, abrir su Issue y usar reacción 👍. Para avisar de datos incorrectos, usar 👎 o comentar. Tres 👍 y ningún 👎 se muestran como **confirmado por usuarios**; no implica auditoría oficial.

## Limitaciones y seguridad
- El flujo exige una cuenta GitHub; no se publica directamente desde la aplicación sin autenticación.
- La lectura pública usa la API de GitHub, sujeta a límites y paginación de 100 resultados; la app no muestra automáticamente más de 100 Issues abiertos.
- Los Issues pueden contener datos incorrectos o maliciosos. Moderar, cerrar Issues falsos y no publicar datos personales.
- No se incluyen automáticamente las aportaciones en el planificador: la validación comunitaria no confirma precio, conectores ni disponibilidad en tiempo real.
- Las reacciones pueden provenir de cuentas falsas; son indicadores comunitarios, no pruebas de funcionamiento.
- Si el repositorio es privado o Issues está desactivado, no funcionará la consulta pública.
