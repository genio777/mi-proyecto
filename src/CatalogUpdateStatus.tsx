import React from 'react';
import type {CatalogResourceState} from './useCatalogUpdates';

type Props={
 native:boolean;
 national:CatalogResourceState;
 tariffs:CatalogResourceState;
 refreshing:boolean;
 pending:boolean;
 message:string;
 refresh:()=>Promise<void>;
 paused:boolean;
};
const date=(value:number|string|null)=>{
 if(value===null)return null;
 const time=typeof value==='number'?value:Date.parse(value);
 return Number.isFinite(time)&&time>=0&&time<=Date.now()+300000?new Date(time).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}):null;
};
function Resource({name,resource,state,native}:{name:string;resource:string;state:CatalogResourceState;native:boolean}){
 const source=!state.available?'Todavía no disponibles':state.source==='embedded'?'Incluido en el APK':state.source==='cached'?'Guardado en este dispositivo':native?'Publicado':'Publicado en la web';
 const sourceDate=date(state.sourceDate),downloadDate=date(state.savedAt),attemptDate=date(state.checkedAt);
 return <div data-catalog-resource={resource} data-catalog-source={state.source||'unavailable'}>
  <p><strong>{name}:</strong> {source}.</p>
  {sourceDate&&<p className="muted">Fecha indicada por los datos: {sourceDate}.</p>}
  {downloadDate&&<p className="muted">Última descarga: {downloadDate}.</p>}
  {attemptDate&&state.warning&&<p className="muted">Último intento de actualización: {attemptDate}.</p>}
  {state.warning&&<p className="notice">{state.warning}</p>}
  {state.error&&<p className="notice">{state.error}{state.available?' Se mantienen los datos que ya estaban disponibles.':''}</p>}
 </div>;
}

export default function CatalogUpdateStatus({native,national,tariffs,refreshing,pending,message,refresh,paused}:Props){
 return <div role="region" aria-label="Estado de los catálogos" className="liveBox catalogUpdateStatus" aria-live="polite" aria-busy={refreshing||pending}>
  <h2>Actualización de catálogos</h2>
  <Resource name="Estaciones de España" resource="national" state={national} native={native}/>
  <Resource name="Referencias de tarifas" resource="tariffs" state={tariffs} native={native}/>
  <button type="button" disabled={paused||refreshing} onClick={()=>void refresh()}>{refreshing?'Actualizando catálogos…':'Actualizar catálogos'}</button>
  {refreshing&&<p className="muted">Consultando los datos disponibles. Puedes seguir utilizando la aplicación.</p>}
  {pending&&<p className="muted">La actualización se aplicará al finalizar el cálculo actual.</p>}
  {message&&<p className="muted">{message}</p>}
  <p className="muted">Los datos se consultan al abrir y se revisan cada hora mientras la aplicación está visible; las copias recientes pueden reutilizarse. Puedes solicitar una actualización manual. Importar datos no verifica precios, gratuidad ni disponibilidad en tiempo real.</p>
 </div>;
}
