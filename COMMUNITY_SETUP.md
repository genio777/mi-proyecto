# Activar comunidad de cargadores gratuitos

La aplicación contiene la interfaz de publicación, lectura y confirmación por otros usuarios. Para que funcione entre móviles hace falta un proyecto Supabase real; GitHub Pages por sí solo no ofrece base de datos de escritura.

1. Crear un proyecto en https://supabase.com y ejecutar `supabase/community.sql` en SQL Editor.
2. En Authentication > Providers, activar **Anonymous Sign-Ins**. Esto crea una identidad anónima por instalación, no es una protección robusta contra votos falsos. Activar protección contra abuso (CAPTCHA/rate limits) antes de lanzamiento público.
3. En GitHub > Settings > Secrets and variables > Actions, crear los secretos `VITE_SUPABASE_URL` (URL del proyecto) y `VITE_SUPABASE_ANON_KEY` (clave pública anon/publishable compatible). **Nunca usar service_role**.
4. Relanzar los workflows de compilación web y Android. Los valores VITE se incluyen en el JavaScript público; la seguridad depende de RLS.
5. Probar en dos teléfonos distintos: alta, lectura compartida, confirmación, voto negativo, cambio de voto, y ausencia de duplicación de votos de la misma identidad.

Estado: aportaciones comunitarias visibles en pestaña Añadir gratis, 3 confirmaciones y 0 avisos muestran estado «Confirmado por la comunidad». Los cargadores no entran en el planificador hasta una validación adicional. La reputación no sustituye la comprobación de condiciones reales.

Limitaciones actuales: sin moderación administrativa, sin denuncia/ocultación automatizada, sin historial de cambios ni fotos, sin comentarios de votos mostrados. La anonimidad permite recrear identidades, así que no es un sistema antifraude sólido; antes de una publicación abierta debe añadirse control de abuso y moderación.
