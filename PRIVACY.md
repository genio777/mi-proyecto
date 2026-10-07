# Privacidad — CargaGratis España

CargaGratis se diseña sin cuenta obligatoria y sin API del fabricante para obtener telemetría del vehículo.

## Datos del vehículo
SOC, energía, temperaturas, consumo e identificadores OBD/CAN se procesan localmente en Android. No se enviarán a GitHub, analítica, backend ni terceros.

## OBD/CAN
La integración es de solo lectura. No se implementarán comandos remotos del vehículo ni escritura CAN. La conexión BLE se inicia por acción del usuario y queda vinculada al dispositivo local.

## Internet
Solo se usa para cartografía, geocodificación, cálculo de rutas y consulta de información pública de recarga. Una disponibilidad desconocida nunca se interpretará como disponible.

## Retención
Perfil, favoritos y preferencias: almacenamiento local. Historial de localización: desactivado por diseño. No existe una base central de movimientos de usuarios.
