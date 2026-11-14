import React,{useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Directory,Encoding,Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {MAX_PERSONAL_BACKUP_BYTES,createPersonalBackup,parsePersonalBackup,restorePersonalBackup,summarizePersonalBackup} from './personal-data.mjs';

export default function PersonalBackup(){
 const [preview,setPreview]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0);
 const exportBackup=async()=>{
  setBusy(true);setMessage('');
  try{
   const {document:backup,warnings}=createPersonalBackup(),body=JSON.stringify(backup);
   const filename='cargagratis-copia-'+backup.createdAt.slice(0,10)+'.json';
   if(Capacitor.isNativePlatform()){
    const file=await Filesystem.writeFile({path:'cargagratis-copia.json',data:body,directory:Directory.Cache,encoding:Encoding.UTF8});
    await Share.share({title:'Copia de seguridad de Carga Gratis',dialogTitle:'Guardar o compartir copia JSON',files:[file.uri]});
    setMessage('Se ha abierto el selector para guardar o compartir la copia. Comprueba que el archivo se haya guardado antes de cambiar de instalación.'+(warnings.length?' '+warnings.join(' '):''));
   }else{
    const url=URL.createObjectURL(new Blob([body],{type:'application/json;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage('Descarga de la copia iniciada. Comprueba que el archivo se haya guardado.'+(warnings.length?' '+warnings.join(' '):''));
   }
  }catch(error){setMessage(error instanceof Error?error.message:'No se pudo crear la copia.');}
  finally{setBusy(false);}
 };
 const selectBackup=async(event:React.ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0],request=++generation.current;setPreview(null);setMessage('');event.target.value='';
  if(!file)return;
  setBusy(true);
  try{
   if(file.size>MAX_PERSONAL_BACKUP_BYTES)throw Error('La copia supera el tamaño máximo permitido (2 MB).');
   const document=parsePersonalBackup(await file.text());if(request!==generation.current)return;
   setPreview({document,summary:summarizePersonalBackup(document)});
  }catch(error){if(request===generation.current)setMessage(error instanceof Error?error.message:'No se pudo leer la copia.');}
  finally{if(request===generation.current)setBusy(false);}
 };
 const restore=()=>{
  if(!preview||busy)return;setBusy(true);setMessage('');
  try{restorePersonalBackup(preview.document);window.location.reload();}
  catch(error){setBusy(false);setMessage(error instanceof Error?error.message:'No se pudo restaurar la copia.');}
 };
 return <section className="personalBackup"><h2>Copia de seguridad</h2><p>Guarda una copia JSON de tus favoritos, puntos personales, perfiles de vehículo, filtros, SOC, reserva, tarifas manuales y simulación guardada. Primero guarda los cambios del perfil y la simulación que quieras conservar.</p><p className="muted">No incluye catálogos, búsquedas de direcciones, credenciales ni lecturas del vehículo. El archivo contiene datos personales, incluidas las ubicaciones que hayas añadido: guárdalo en un lugar de confianza.</p><button type="button" disabled={busy} onClick={()=>void exportBackup()}>Exportar copia JSON</button><label>Seleccionar copia JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={event=>void selectBackup(event)}/></label>{preview&&<div className="liveBox"><h3>Revisar copia</h3><p>Copia del {new Date(preview.document.createdAt).toLocaleString('es-ES')} · {preview.summary.settings} ajustes · {preview.summary.favorites} favoritos · {preview.summary.localChargers} puntos personales · {preview.summary.vehicleProfiles} perfiles.</p><p>Al restaurar se reemplazan únicamente los datos incluidos en esta copia. Los demás ajustes se conservan y la aplicación se vuelve a abrir. Los puntos personales siguen sin verificar.</p><button type="button" disabled={busy} onClick={restore}>Restaurar esta copia</button><button type="button" disabled={busy} onClick={()=>setPreview(null)}>Cancelar restauración</button></div>}{message&&<p role="status" className="notice">{message}</p>}</section>;
}
