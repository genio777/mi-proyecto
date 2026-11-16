import {Capacitor} from '@capacitor/core';
import {createCatalogUpdates,CATALOG_CACHE_MAX_AGE_MS} from './catalog-updates.mjs';
import {configureInternationalCatalog} from './international-catalog.mjs';

export const nativeCatalogMode=Capacitor.isNativePlatform();
export const catalogUpdates=createCatalogUpdates({native:nativeCatalogMode});
let calculationIsRunning=()=>false;
export function setCatalogCalculationGuard(guard:()=>boolean){
 calculationIsRunning=guard;
 return()=>{if(calculationIsRunning===guard)calculationIsRunning=()=>false;};
}

// Configure before React mounts. Published files are public snapshots; REVE
// authentication stays in Actions, and routing/geocoding never use this client.
configureInternationalCatalog({
 cacheTtlMs:CATALOG_CACHE_MAX_AGE_MS,
 // Preserve the distance-based search budget. A trip reads its available
 // snapshot; browsing a country refreshes its published snapshot on demand.
 ...(nativeCatalogMode?{readJson:async(file:string,options:any)=>(await catalogUpdates.read('data/international/'+file,{...options,network:!calculationIsRunning()})).data}:{}),
});
