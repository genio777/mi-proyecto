import React from 'react';

export default function PrivacyInformation(){
 return <>
  <p className="muted">Datos personales guardados en este dispositivo y servicios utilizados al consultar el mapa o planificar.</p>
  <div className="securityGrid">
   <article><h3>Acceso</h3><p>Puedes usar la aplicación sin cuenta. Para publicar o votar aportaciones se utiliza una cuenta de GitHub.</p></article>
   <article><h3>Perfil y vehículo</h3><p>El perfil, SOC, consumo y tarifas manuales se guardan localmente. Las lecturas automáticas de SOC y BMS todavía no están validadas; el cálculo utiliza los valores que introduces.</p></article>
   <article><h3>Direcciones y rutas</h3><p>Buscar una dirección envía el texto al servicio Photon. Calcular un viaje envía las coordenadas de origen, destinos y paradas al servicio de rutas OSRM configurado.</p></article>
   <article><h3>Mapa y ubicación</h3><p>El GPS se solicita al pulsar «Mi ubicación». Los mosaicos del mapa se descargan de OpenStreetMap, que recibe las peticiones del área visualizada.</p></article>
   <article><h3>Información local</h3><p>Favoritos y puntos personales permanecen en este dispositivo. La caché local de búsqueda puede contener consultas y coordenadas; sus resultados se reutilizan durante un máximo de 30 días.</p></article>
   <article><h3>Catálogos de recarga</h3><p>Los catálogos y sus atribuciones se publican desde GitHub. El acceso autenticado a REVE se realiza en GitHub Actions; la aplicación no solicita la clave.</p></article>
  </div>
 </>;
}
