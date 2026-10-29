#!/usr/bin/env python3
"""RIPREE MITECO public CSV, conservative merge: no fabricated price or live status."""
import csv, io, json, re, unicodedata, urllib.request
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
    try:return float(v)
    except ValueError:return None
def run():
    req=urllib.request.Request(URL,headers={'User-Agent':'CargaGratisEspanaJpaz/1.0','Accept':'text/csv,*/*'})
    with urllib.request.urlopen(req,timeout=55) as response:
        raw=response.read(45_000_000)
        mime=response.headers.get('Content-Type','')
    if len(raw)<100 or raw[:2]==b'PK' or b'<html' in raw[:500].lower():
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
        if power is None or power<=0 or power>1000:
            skipped+=1;continue
        rawconn=col(row,'tipo de conector','tipo conector','conector','conectores','tipo de toma','tipos de conectores')
        conn=[]
        low=normal(rawconn)
        for term,label in [('ccs','CCS'),('combo','CCS'),('chademo','CHAdeMO'),('tipo2','Tipo2'),('type2','Tipo2'),('schuko','Schuko')]:
            if term in low and label not in conn:conn.append(label)
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
            'lat':lat,'lng':lng,'power':power,'connector':', '.join(conn),
            'price':None,'availability':'Desconocida','verified':'Sin verificación individual',
            'source':'MITECO RIPREE · registro '+sourceid
        })
        ids.add(stationid);coords.add(locationkey(lat,lng));added+=1
    if count<10:raise RuntimeError('CSV RIPREE sospechosamente vacío: '+str(count))
    catalog['mitecoRipreeSource']={
        'url':URL,'checkedAt':datetime.now(timezone.utc).isoformat(),
        'recordsReviewed':count,'added':added,'duplicatesRejected':duplicate,'incompleteRejected':skipped,
        'note':'Fuente estática. Precio y disponibilidad NO inferidos.'
    }
    TARGET.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('RIPREE:',catalog['mitecoRipreeSource'])
if __name__=='__main__':run()
