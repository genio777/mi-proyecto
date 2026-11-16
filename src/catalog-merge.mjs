// Compare public JSON without retaining another large serialized catalogue.
export function sameCatalogData(first,second){
 const pending=[[first,second]];
 while(pending.length){
  const [a,b]=pending.pop();if(a===b)continue;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);if(keys.length!==Object.keys(b).length)return false;
  for(const key of keys){if(!Object.hasOwn(b,key))return false;pending.push([a[key],b[key]]);}
 }
 return true;
}

export function replaceNationalCatalog(previous,previousNational,nextNational){
 const previousIds=new Set(previousNational.map(station=>station.id));
 return [...new Map([...previous.filter(station=>!previousIds.has(station.id)),...nextNational].map(station=>[station.id,station])).values()];
}

export function mergeCountryCatalog(previous,incoming,countries=[]){
 const replaced=new Set(countries);
 const keep=previous.filter(station=>!(String(station.id).startsWith('ocm-global-')&&replaced.has(station.country)));
 return [...new Map([...keep,...incoming].map(station=>[station.id,station])).values()];
}
