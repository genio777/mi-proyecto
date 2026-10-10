/* CargaGratis: no conservar versiones antiguas del planificador. */
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('cargagratis-'))await caches.delete(key);await self.clients.claim();await self.registration.unregister()})())});
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'){event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)))}});
