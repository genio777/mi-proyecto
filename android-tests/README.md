# Pruebas de ejecución Android

`prepare-android.mjs` copia las fuentes Java de esta carpeta al proyecto Capacitor generado. `NativeSmokeTest` arranca `MainActivity` con AndroidJUnitRunner y consulta el DOM del WebView real. No sustituye el servidor local de Capacitor, los recursos ni las respuestas de red.

La comprobación exige arranque de la versión empaquetada, aviso legal antes del mapa, tres destinos, conectores diferenciados y controles de copia con plugins nativos registrados. La exportación pulsa el botón real, lee el JSON escrito por Filesystem en caché privada, confirma que conserva favoritos válidos y excluye caché geográfica y un SOC inválido. Abre y cierra el selector nativo de compartir sin enviar el archivo a nadie. Una ausencia del DOM, del puente o del archivo provoca fallo. El script de resultados también rechaza cero pruebas, pruebas omitidas o resultados parciales.

En un dispositivo de prueba o emulador conectado:

```bash
npm run build
node scripts/prepare-android.mjs
bash android-tests/run-smoke.sh
```

El workflow Android utiliza un emulador API 35 con aceleración KVM y ejecuta explícitamente la clase `es.cargagratis.app.NativeSmokeTest`, sin incluir el ejemplo de plantilla Capacitor que conserva otro identificador de aplicación. Espera el catálogo empaquetado antes de interactuar y admite callbacks JavaScript de hasta 15 segundos durante el arranque en frío, dentro de cada espera acotada de 45 segundos. Conserva XML, informe HTML, captura y logcat. Estas pruebas no verifican el selector de importación del sistema, GPS físico, sensores del vehículo, cobertura real de estaciones ni disponibilidad de proveedores externos.

La distribución sigue siendo de depuración. La firma persistente requiere un almacén privado en secretos de Actions; no se genera uno temporal como solución para actualizaciones. La conexión actual no permite gestionar esos secretos (HTTP 403). Una clave nueva no recupera las firmas de APK entregados anteriormente.
