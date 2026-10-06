import React,{useEffect,useRef,useState}from'react';import{createRoot}from'react-dom/client';import L from'leaflet';import'leaflet/dist/leaflet.css';import'./style.css';

type Charger={id:string,name:string,city:string,lat:number,lng:number,power:number,connector:string,price:number|null,condition?:string,source:string,verified:string};
const chargers:Charger[]=[
{id:'demo-sev-1',name:'Punto DEMO supermercado',city:'Sevilla',lat:37.3891,lng:-5.9845,power:22,connector:'Tipo 2',price:0,source:'DEMO',verified:'Pendiente'},
{id:'demo-hue-1',name:'Punto DEMO centro comercial',city:'Huelva',lat:37.2614,lng:-6.9447,power:22,connector:'Tipo 2',price:0,condition:'Con compra',source:'DEMO',verified:'Pendiente'},
{id:'demo-mad-1',name:'Punto DEMO municipal',city:'Madrid',lat:40.4168,lng:-3.7038,power:50,connector:'CCS',price:0,source:'DEMO',verified:'Pendiente'}
];

function MapView({position,onlyFree}:{position:[number,number]|null,onlyFree:boolean}){
 const ref=useRef<HTMLDivElement>(null),mapRef=useRef<L.Map|null>(null);
 useEffect(()=>{if(!ref.current||mapRef.current)return;const m=L.map(ref.current).setView([40.2,-3.7],6);mapRef.current=m;
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(m);
 chargers.filter(c=>!onlyFree||c.price===0).forEach(c=>L.circleMarker([c.lat,c.lng],{radius:9,weight:3,fillOpacity:.9}).addTo(m).bindPopup('<b>'+c.name+'</b><br>'+c.city+' · '+c.power+' kW · '+c.connector+'<br><b>GRATIS · DEMO</b>'));
 setTimeout(()=>m.invalidateSize(),50);return()=>{m.remove();mapRef.current=null}},[onlyFree]);
 useEffect(()=>{const m=mapRef.current;if(!m||!position)return;L.circleMarker(position,{radius:8,weight:3,fillOpacity:1}).addTo(m).bindPopup('Tu ubicación').openPopup();m.setView(position,13)},[position]);
 return <div id="map" ref={ref}/>;
}

function App(){
 const[tab,setTab]=useState('mapa'),[pos,setPos]=useState<[number,number]|null>(null),[msg,setMsg]=useState('Sin localizar'),[onlyFree,setOnlyFree]=useState(true);
 const locate=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>{const q:[number,number]=[p.coords.latitude,p.coords.longitude];setPos(q);setMsg(q[0].toFixed(4)+', '+q[1].toFixed(4))},()=>setMsg('Permiso de ubicación no concedido'),{enableHighAccuracy:true,timeout:12000}):setMsg('GPS no disponible');
 const nav=(c:Charger)=>window.open('https://www.google.com/maps/dir/?api=1&destination='+c.lat+','+c.lng,'_blank');
 return <main><header><div><b>⚡ CargaGratis España</b><small>V2 · mapa + GPS</small></div><button onClick={locate}>◎ Mi ubicación</button></header>
 <nav>{['mapa','viaje','favoritos','vehículo'].map(x=><button key={x} className={tab===x?'on':''} onClick={()=>setTab(x)}>{x}</button>)}</nav>
 {tab==='mapa'&&<section><div className="titleRow"><div><h1>Cargadores</h1><p className="muted">España · estructura preparada para datos OCPI/Reve</p></div><label className="switch"><input type="checkbox" checked={onlyFree} onChange={e=>setOnlyFree(e.target.checked)}/> Solo gratis</label></div>
 <p className="notice">⚠️ Los 3 puntos actuales siguen siendo DEMO. No se mostrarán como reales hasta verificar fuente y tarifa.</p><div className="location">📍 {msg}</div><MapView position={pos} onlyFree={onlyFree}/>
 <div className="cards">{chargers.filter(c=>!onlyFree||c.price===0).map(c=><article key={c.id}><div className="badge">DEMO</div><h3>{c.name}</h3><p>{c.city} · {c.power} kW · {c.connector}</p><strong>{c.condition?'Gratis condicionado · '+c.condition:'Gratis'}</strong><small>Fuente: {c.source} · Verificación: {c.verified}</small><button onClick={()=>nav(c)}>Navegar</button></article>)}</div></section>}
 {tab==='viaje'&&<section><h1>Ruta 0 €</h1><label>Origen<input placeholder="Mi ubicación"/></label><label>Destino<input placeholder="Ej. Barcelona"/></label><div className="grid"><label>SOC salida (%)<input type="number" defaultValue="90"/></label><label>Reserva mínima (%)<input type="number" defaultValue="15"/></label></div><button className="primary">Calcular ruta gratuita</button><p className="muted">Siguiente fase: cálculo energético y selección automática de cargadores gratuitos.</p></section>}
 {tab==='favoritos'&&<section><h1>Favoritos</h1><p>Aquí aparecerán tus cargadores guardados.</p></section>}
 {tab==='vehículo'&&<section><h1>Mi vehículo</h1><label>Modelo<input defaultValue="Tesla Model Y Standard Range"/></label><label>Batería útil (kWh)<input type="number" defaultValue="57.5"/></label><label>Consumo (kWh/100 km)<input type="number" defaultValue="17"/></label><button className="primary">Guardar perfil</button></section>}
 <footer>V2 · Datos de cargadores actuales: DEMO</footer></main>
}createRoot(document.getElementById('root')!).render(<App/>);