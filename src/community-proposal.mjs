const connectors=new Set(['Tipo2','CCS','CHAdeMO']);
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);

// GitHub issue bodies are user input. Only these displayable fields cross into React.
export function parseCommunityProposal(body) {
 if(typeof body!=='string'||body.length>100000)return null;
 const match=body.match(/<!-- CARGAGRATIS_POINT\n([\s\S]*?)\n-->/);
 if(!match)return null;
 try{
  const value=JSON.parse(match[1]);
  if(!value||typeof value!=='object'||Array.isArray(value)||
   !text(value.name,200,true)||!text(value.address,1000)||!text(value.instructions,8000,true)||
   !Number.isFinite(value.lat)||Math.abs(value.lat)>90||!Number.isFinite(value.lng)||Math.abs(value.lng)>180||
   !Number.isFinite(value.power_kw)||value.power_kw<=0||value.power_kw>1000||!connectors.has(value.connector))return null;
  return {name:value.name.trim(),address:value.address.trim(),instructions:value.instructions.trim(),lat:value.lat,lng:value.lng,power_kw:value.power_kw,connector:value.connector};
 }catch{return null;}
}

export function communityEntries(data) {
 if(!Array.isArray(data))throw Error('Formato de respuesta de GitHub no válido');
 return data.flatMap(entry=>{
  if(!entry||entry.state!=='open'||!Number.isSafeInteger(entry.number)||entry.number<1)return [];
  const proposal=parseCommunityProposal(entry.body);
  if(!proposal)return [];
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  return [{number:entry.number,proposal,yes:count(entry.reactions?.['+1']),no:count(entry.reactions?.['-1'])}];
 });
}
