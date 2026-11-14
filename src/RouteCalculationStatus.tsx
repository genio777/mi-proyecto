import React,{useEffect,useState} from 'react';

// Keep the once-a-second clock isolated from the large station catalogue.
export default function RouteCalculationStatus({startedAt,routeKm,searchBudgetMs}:{startedAt:number;routeKm?:number;searchBudgetMs?:number}) {
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{const update=()=>setSeconds(Math.max(0,Math.floor((Date.now()-startedAt)/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer)},[startedAt]);
 return <p className="routeCalculationStatus"><span aria-label="Tiempo transcurrido" aria-live="off">Tiempo transcurrido: {seconds} s</span>{routeKm!==undefined&&searchBudgetMs!==undefined?<small aria-label="Presupuesto de búsqueda">Ruta base: {Math.round(routeKm)} km · Límite de búsqueda: {Math.ceil(searchBudgetMs/1000)} s</small>:<small>Preparando direcciones y ruta por carretera.</small>}<small>Tiempo máximo total: 45 segundos. Puedes cancelarlo en cualquier momento.</small></p>;
}
