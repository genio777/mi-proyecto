#!/usr/bin/env python3
"""RIPREE MITECO public CSV, conservative merge: no fabricated price or live status."""
import csv, io, json, math, re, unicodedata, urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL='https://energia.serviciosmin.gob.es/Ripree/ExportarInstalaciones/Export'
TARGET=Path('public/data/chargers-spain.json')
def normal(s):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(s or '').lower()) if not unicodedata.combining(c)).replace('_','').replace(' ','').replace('-','')
def col(row,*names):
    mapping={normal(k):v for k,v in row.items() if k}
    for name in names:
        v=mapping.get(normal(name))
        if v is not None and str(v).strip():return str(v).strip()
    return ''
def num(v):
    v=str(v or '').strip().replace(' ','')
    if ',' in v and '.' in v:
        v=v.replace('.','').replace(',','.') if v.rfind(',')>v.rfind('.') else v.replace(',','')
    else:v=v.replace(',','.')
    try:
        parsed=float(v)
        return parsed if math.isfinite(parsed) else None
    except ValueError:return None
def connector_fields(row):
    """A site's maximum power cannot be assigned to each socket type."""
    raw=col(row,'tipo de conector','tipo conector','conector','conectores','tipo de toma','tipos de conectores')
    low=normal(raw)
    labels=[]
    # Keep Type 1 / CCS1 and GB/T distinct from European Type 2 / CCS2.
    for terms,label in [
        (('ccs1','combo1'),'CCS1'),(('ccs2','combo2','iec62196t2combo'),'CCS'),
        (('chademo',),'CHAdeMO'),(('tipo2','type2','iec62196t2'),'Tipo2'),
        (('schuko',),'Schuko')]:
        if any(term in low for term in terms):labels.append(label)
    # "CCS" alone does not identify CCS1 vs CCS2. Similarly, Combo2 embeds
    # Type2 in some formal names but is not an AC Type2 socket.
    if low in ('ccs','combo'):labels=['CCS (formato sin especificar)']
    if 'CCS' in labels and low in ('iec62196t2combo',):labels.remove('Tipo2')
    connector_power=num(col(row,'potencia conector kw','potencia conector (kw)',
        'potencia por toma (kw)','potencia de la toma (kw)','connector power kw'))
    verified=[]
    if len(labels)==1 and labels[0]!='CCS (formato sin especificar)' and connector_power is not None and connector_power>0:
        verified=[{'type':labels[0],'powerKw':connector_power,'price':None,
            'powerType':'AC' if labels[0] in ('Tipo2','Schuko') else 'DC',
            'officialConnectorId':None}]
    return raw,labels,verified
def run():
    req=urllib.request.Request(URL,headers={'User-Agent':'CargaGratisEspanaJpaz/1.0','Accept':'text/csv,*/*'})
    with urllib.request.urlopen(req,timeout=55) as response:
        raw=response.read(45_000_000)
        mime=response.headers.get('Content-Type','')
    if len(raw)<100 or len(raw)>=45_000_000 or raw[:2]==b'PK' or b'<html' in raw[:500].lower() or b'<!doctype html' in raw[:500].lower() or 'text/html' in mime.lower():
        raise RuntimeError('RIPREE no devolvió un CSV reconocible; no se modifica catálogo')
    data=raw.decode('utf-8-sig',errors='replace')
    try:delimiter=csv.Sniffer().sniff(data[:10000],delimiters=';,\t|').delimiter
    except csv.Error:delimiter=';'
    rows=csv.DictReader(io.StringIO(data),delimiter=delimiter)
    if not rows.fieldnames:raise RuntimeError('CSV sin cabeceras')
    print('RIPREE columnas:',rows.fieldnames)
    catalog=json.loads(TARGET.read_text(encoding='utf-8'))
    chargers=catalog['chargers']
    ids={str(c['id']) for c in chargers}
    def locationkey(lat,lng):return (round(lat,4),round(lng,4))
    coords={locationkey(float(c['lat']),float(c['lng'])) for c in chargers if isinstance(c.get('lat'),(int,float)) and isinstance(c.get('lng'),(int,float))}
    count=added=duplicate=skipped=0
    for row in rows:
        count+=1
        lat=num(col(row,'latitud','latitude','latitud decimal','coordenada y','coord_y','lat'))
        lng=num(col(row,'longitud','longitude','longitud decimal','coordenada x','coord_x','lon','lng'))
        if lat is None or lng is None or not (27<=lat<=44.6 and -18.5<=lng<=4.6):
            skipped+=1;continue
        power=num(col(row,'potencia kw','potencia (kw)','potencia maxima kw','potencia maxima','potencia','powerkw','potencia del punto (kw)'))
        if power is None or power<=0:
            skipped+=1;continue
        rawconn,conn,connectors=connector_fields(row)
        if not conn:
            skipped+=1;continue
        sourceid=col(row,'id punto de recarga','id punto','id instalacion','identificador instalacion','id','codigo identificativo','codigo')
        if not sourceid:
            skipped+=1;continue
        stationid='ripree-'+re.sub(r'[^a-zA-Z0-9_-]','_',sourceid)
        if stationid in ids or locationkey(lat,lng) in coords:
            duplicate+=1;continue
        chargers.append({
            'id':stationid,'name':col(row,'nombre','nombre instalacion','nombre de la instalacion','denominacion') or 'Punto de recarga RIPREE',
            'city':col(row,'municipio','localidad','poblacion'),'province':col(row,'provincia'),
            'address':col(row,'direccion','direccion postal','via'),'operator':col(row,'operador','nombre operador','cpo'),
            'lat':lat,'lng':lng,'power':power,'connector':', '.join(conn),'connectors':connectors,
            'rawConnectorDescription':rawconn,
            'powerScope':'connector' if connectors else 'site_unassigned',
            'price':None,'availability':'Desconocida','verified':'Sin verificación individual',
            'source':'MITECO RIPREE · registro '+sourceid
        })
        ids.add(stationid);coords.add(locationkey(lat,lng));added+=1
    if count<10:raise RuntimeError('CSV RIPREE sospechosamente vacío: '+str(count))
    catalog['mitecoRipreeSource']={
        'url':URL,'checkedAt':datetime.now(timezone.utc).isoformat(),
        'recordsReviewed':count,'added':added,'duplicatesRejected':duplicate,'incompleteRejected':skipped,
        'note':'Fuente estática. Precio y disponibilidad NO inferidos. Sin potencia explícita de toma, la potencia del emplazamiento no se usa para calcular compatibilidad ni recargas.'
    }
    TARGET.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('RIPREE:',catalog['mitecoRipreeSource'])
if __name__=='__main__':run()
