// CargaGratis España: cache seguro para despliegues frecuentes en GitHub Pages.
const CACHE='cargagratis-shell-v6';
const SHELL=['./manifest.webmanifest'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(SHELL.map(url=>cache.add(url)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('cargagratis-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 // No cachear catálogos ni tarifas: nunca presentar información económica antigua como reciente.
 if(url.pathname.includes('/data/')||url.pathname.endsWith('/data'))return;
 // HTML de entrada siempre de red; solo usar la copia anterior cuando no hay conexión.
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}
   return response;
  }).catch(async()=>await caches.match(request)||await caches.match('./')||new Response('Sin conexión. Abre CargaGratis cuando recuperes internet.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
  return;
 }
 // Recursos versionados: cachear únicamente respuestas válidas y nunca errores.
 if(url.pathname.includes('/assets/')||url.pathname.endsWith('/manifest.webmanifest')){
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
   if(response.ok&&response.type!=='opaque'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}
   return response;
  })));
 }
});
