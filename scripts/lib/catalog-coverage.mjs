// Derived only from the licensed records actually present in a country file.
// The cells help skip irrelevant country downloads; they never add coverage.
export function catalogCoverageCells(stations) {
 const cells=new Map();
 for(const station of stations){
  if(!Number.isFinite(station.lat)||!Number.isFinite(station.lng)||Math.abs(station.lat)>90||Math.abs(station.lng)>180)throw Error('Cannot index invalid station coordinates');
  const cell=[Math.floor(station.lng),Math.floor(station.lat)];
  cells.set(cell.join(':'),cell);
 }
 return [...cells.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
