# CargaGratis España — Security Architecture

## Principios obligatorios
1. Zero Trust y mínimo privilegio.
2. Integraciones de vehículo en modo solo lectura.
3. Nunca almacenar contraseñas de Tesla u otros fabricantes.
4. OAuth 2.x Authorization Code + PKCE para clientes públicos.
5. Tokens del fabricante solo en backend privado, cifrados en reposo y revocables.
6. Ningún secreto, token, VIN completo o clave privada en Git, frontend, logs o analytics.
7. OBD-II BLE local-only por defecto. No escribir CAN/PIDs.
8. Separación lógica entre identidad, vehículo, telemetría y localización.
9. Row Level Security por usuario y deny-by-default.
10. Retención mínima: no conservar historial de ubicación por defecto.
11. TLS obligatorio; CSP estricta; protección XSS/CSRF; validación de entradas.
12. Rate limiting, detección de abuso y bloqueo temporal.
13. Sesiones cortas, refresh token rotado, revocación de dispositivos y cierre global.
14. Passkeys/WebAuthn preferentes; 2FA disponible.
15. Auditoría de acceso sin guardar tokens, coordenadas precisas ni telemetría sensible.
16. Dependencias fijadas y actualización automática con revisión de vulnerabilidades.
17. Backups cifrados y plan de revocación/rotación ante incidente.
18. El frontend público solo recibe los datos mínimos necesarios para el cálculo.
19. Comandos remotos del vehículo fuera del alcance de CargaGratis.
20. Antes de producción: threat model STRIDE + revisión OWASP ASVS/MASVS y pruebas de penetración.

## Fronteras
PUBLIC: mapa, cargadores, tarifas, rutas anónimas.
PRIVATE APP: perfil y preferencias del usuario.
PRIVATE BACKEND: OAuth exchange, token vault, proxy de telemetría.
LOCAL DEVICE: OBD-II/BMS, preferentemente sin subir telemetría.
