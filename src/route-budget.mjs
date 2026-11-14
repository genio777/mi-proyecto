export const MAX_ROUTE_CALCULATION_MS=45000;

// Search starts only after the road distance is known. Address lookup and
// baseline routing remain subject to the independent overall 45-second limit.
export function routeSearchBudget(distanceKm) {
 if(!Number.isFinite(distanceKm)||distanceKm<0)throw Error('Distancia de ruta no válida');
 const seconds=Math.max(4,Math.min(45,Math.ceil(distanceKm*4/100)));
 return {distanceKm,seconds,milliseconds:seconds*1000};
}
