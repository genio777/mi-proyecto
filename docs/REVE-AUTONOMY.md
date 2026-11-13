# Autonomía de REVE y caducidad de la credencial

La fecha comunicada por el titular es **29 de octubre de 2027**, inclusive en Europe/Madrid. Se configura como `2027-10-29`; es metadato público, no una credencial. La autorización real depende de REVE y puede ser revocada antes.

## Qué se automatiza

- El workflow de Pages prepara datos cada diez minutos cuando GitHub lo ejecuta. La integración REVE reserva un máximo conservador de cuatro consultas de inventario por hora y conserva cursor e inventario entre publicaciones.
- La caducidad se comprueba antes de consultar. Se emiten avisos al entrar en ventanas de 60, 30 y 7 días. El día comunicado se interpreta en Madrid, incluidos cambios de horario de verano.
- El workflow `Verificar acceso y caducidad REVE` comprueba diariamente la presencia y caducidad configurada sin consumir consultas REVE. Durante el último mes señala renovación requerida mediante un fallo visible en Actions; las notificaciones dependen de la configuración de GitHub del titular.
- Al caducar, faltar o rechazarse la credencial, se conserva la última información conocida. La aplicación diferencia credencial caducada, fecha inválida, acceso no autorizado y sincronización pendiente. No presenta la caché como disponibilidad o precios en directo.

Los workflows programados se activan en la rama predeterminada después de integrar los cambios. Una rama de desarrollo o una PR por sí sola no activa su programación.

## Configuración segura

1. En [Secrets de Actions del repositorio](https://github.com/genio777/mi-proyecto/settings/secrets/actions), guardar la clave oficial como secreto de repositorio **REVE_API_KEY**.
2. Opcionalmente, crear la variable de Actions **REVE_API_KEY_EXPIRES_ON** con la fecha `2027-10-29`. El código usa esa fecha por defecto hasta que el titular la cambie tras una renovación confirmada.
3. Ejecutar el workflow existente **Comprobar catálogo DGT y acceso REVE**, seleccionar la rama de desarrollo y el alcance **reve**. Esta comprobación hace una sola consulta de inventario. No publica ubicaciones ni la clave; el resumen informa únicamente estado HTTP y recuentos de estructura/potencia.
4. Si REVE responde 401/403, no se considera una autenticación correcta. Si responde 429, se espera al siguiente intervalo; no se reintenta en bucle.

La clave nunca debe ir en `VITE_*`, HTML, JavaScript del navegador, un archivo de configuración, un commit o un artefacto. La comprobación de fecha utiliza solo su presencia y no comprueba autorización por sí misma; esa autorización se verifica con la consulta manual dentro de Actions.

## Qué requiere REVE

La [especificación pública oficial](https://www.mapareve.es/api/external/v1/docs/api-docs.json) examinada contiene diez operaciones GET de datos/documentación y autenticación mediante `x-api-key`. **No publica un endpoint de renovación o rotación, OAuth ni un refresh token.** El [formulario oficial de acceso](https://www.mapareve.es/api-contacto) solicita correo y motivo, sujeto a revisión. Esto no demuestra que REVE carezca de procesos privados; su automatización necesitaría un procedimiento oficialmente proporcionado.

Por tanto, la sincronización de datos **no renueva la clave**. El código no modifica la fecha para simular una renovación. Al recibir una nueva credencial y su vigencia confirmada por REVE, el titular debe actualizar el secreto y la variable de fecha y volver a ejecutar la comprobación autenticada. Hasta disponer de un mecanismo oficial de renovación, no se puede garantizar funcionamiento autenticado indefinido sin intervención.

## Comprobaciones

Pruebas automáticas cubren calendario de Madrid, ventanas de aviso, último instante válido y primer instante caducado, ambos cambios de hora de 2027, fecha inválida, secreto ausente, salida y resumen sin credenciales, bloqueo de red fuera de Actions, rechazo 401/403, límite 429 y caché conservada. La sonda usa fixtures en las pruebas; su existencia no equivale a una autenticación real superada.
