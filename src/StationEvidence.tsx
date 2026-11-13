import React from 'react';
import {describeStationEvidence} from './station-evidence.mjs';

type StationEvidenceRecord={
 source?:string;
 sourceUrl?:string;
 sourceUpdatedAt?:string|null;
 reveUpdated?:string|null;
 price?:number|null;
 priceSource?:string|null;
 priceVerifiedAt?:string|null;
 dataProvider?:{name?:string;url?:string;license?:string;licenseUrl?:string};
};
type EvidenceQuote={source:'station'|'reference'|'manual';rate:number};
export default function StationEvidence({station,quote,now}:{station:StationEvidenceRecord;quote?:EvidenceQuote|null;now?:number}){
 const evidence=describeStationEvidence(station,quote,now);
 const rate=evidence.price.rate===null?null:new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:4}).format(evidence.price.rate)+' €/kWh';
 return <aside className="stationEvidence" aria-label="Confianza de los datos de esta parada">
  <dl className="stationEvidenceGrid">
   <div><dt>Precio</dt><dd><span className={'evidenceBadge evidenceBadge--'+evidence.price.status}>{evidence.price.label}</span>{rate&&<span className="evidenceRate"> · {rate}</span>}</dd></div>
   <div><dt>Fecha de la fuente</dt><dd>{evidence.source.updatedLabel}</dd></div>
   <div><dt>Disponibilidad</dt><dd>{evidence.availability.label}</dd></div>
  </dl>
  <p className="muted">{evidence.price.reason}</p>
  <p className="muted evidenceAvailability">{evidence.availability.detail}</p>
  <p className="stationEvidenceLinks">Fuente: {evidence.source.url?<a href={evidence.source.url} target="_blank" rel="noopener noreferrer">{evidence.source.name}</a>:evidence.source.name}
   {evidence.price.sourceUrl&&<> · <a href={evidence.price.sourceUrl} target="_blank" rel="noopener noreferrer">Fuente de la tarifa comprobada</a></>}
  </p>
  {(evidence.source.providerName||evidence.source.license)&&<p className="muted stationEvidenceLinks">
   {evidence.source.providerName&&<>Proveedor: {evidence.source.providerUrl?<a href={evidence.source.providerUrl} target="_blank" rel="noopener noreferrer">{evidence.source.providerName}</a>:evidence.source.providerName}</>}
   {evidence.source.license&&<>{evidence.source.providerName?' · ':''}Licencia: {evidence.source.licenseUrl?<a href={evidence.source.licenseUrl} target="_blank" rel="noopener noreferrer">{evidence.source.license}</a>:evidence.source.license}</>}
  </p>}
 </aside>;
}
