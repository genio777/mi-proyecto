// World copies are a drawing detail. Never mutate or return these coordinates
// to the routing provider, navigation links or the station catalogue.
const validPoint=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180;
const requirePoint=point=>{if(!validPoint(point))throw Error('Coordenadas de mapa no válidas');};
export function longitudeInWorld(longitude,referenceLongitude){
 if(!Number.isFinite(longitude)||!Number.isFinite(referenceLongitude))throw Error('Longitud de mapa no válida');
 return longitude+360*Math.round((referenceLongitude-longitude)/360);
}
export function unwrapRouteCoordinates(points){
 if(!Array.isArray(points))throw Error('Ruta de mapa no válida');
 const coordinates=[];let worldOffset=0;
 for(let index=0;index<points.length;index++){
  const point=points[index];requirePoint(point);
  if(index===0){coordinates.push([...point]);continue;}
  const delta=point[1]-points[index-1][1];
  if(delta>180)worldOffset-=360;else if(delta< -180)worldOffset+=360;
  coordinates.push([point[0],point[1]+worldOffset]);
 }
 return coordinates;
}
export function routeDisplayGeometry(points,stopPoints=[]){
 const coordinates=unwrapRouteCoordinates(points);
 if(!Array.isArray(stopPoints))throw Error('Paradas de mapa no válidas');
 let firstIndex=0;
 const stops=stopPoints.map(point=>{
  requirePoint(point);if(!coordinates.length)return [...point];
  let nearest=Infinity,routeIndex=firstIndex;
  const longitudeScale=Math.cos(point[0]*Math.PI/180);
  // Stops arrive in itinerary order. Locate their world copy along that route,
  // including trips that cross the date line repeatedly or pass several worlds.
  for(let index=firstIndex;index<coordinates.length;index++){
   const candidate=coordinates[index],deltaLatitude=point[0]-candidate[0];
   const deltaLongitude=(longitudeInWorld(point[1],candidate[1])-candidate[1])*longitudeScale;
   const distance=deltaLatitude*deltaLatitude+deltaLongitude*deltaLongitude;
   if(distance<nearest){nearest=distance;routeIndex=index;}
  }
  firstIndex=routeIndex;
  return [point[0],longitudeInWorld(point[1],coordinates[routeIndex][1])];
 });
 return {coordinates,stops};
}
