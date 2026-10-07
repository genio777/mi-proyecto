import fs from 'node:fs/promises';
const path='public/data/operator-tariffs.json';
const data=JSON.parse(await fs.readFile(path,'utf8'));
const checks=[
 ['repsol','https://www.repsol.es/particulares/vehiculos/movilidad-electrica/recarga-fuera-de-casa/'],
 ['iberdrola-bp','https://iberdrola-bppulse.es/cargar-coche-electrico/tarifas/'],
 ['zunder','https://www.zunder.com/usuario-ve/'],
 ['endesa','https://www.endesaxway.com/es/es/productos-y-servicios/app-endesaxway-servicio-recarga/tarifas'],
 ['tesla','https://www.tesla.com/es_es/support/charging/supercharger/fees'],
 ['ionity','https://www.ionity.eu/es/red/acceso-pagos'],
 ['powerdot','https://www.powerdot.eu/mobility-apps']
];
const now=new Date().toISOString();
for(const [id,url] of checks){
 const op=data.operators.find(o=>o.id===id); if(!op)continue;
 try{const r=await fetch(url,{headers:{'user-agent':'CargaGratis-Espana/0.2 tariff-monitor'}});op.lastCheck=now;op.sourceReachable=r.ok;if(!r.ok)op.lastError='HTTP '+r.status;else delete op.lastError}
 catch(e){op.lastCheck=now;op.sourceReachable=false;op.lastError=String(e)}
}
data.updated=now;
await fs.writeFile(path,JSON.stringify(data,null,2)+'\n');
