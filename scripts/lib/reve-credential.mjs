// Public account metadata, never an API credential. Override after renewal using
// the Actions variable REVE_API_KEY_EXPIRES_ON. The date supplied by the owner is
// inclusive in Europe/Madrid; REVE may revoke the credential earlier (HTTP 401/403).
export const DEFAULT_REVE_API_KEY_EXPIRES_ON='2027-10-29';
export const REVE_CREDENTIAL_TIME_ZONE='Europe/Madrid';
const dayMs=86400000;
const dateFormat=new Intl.DateTimeFormat('en-GB',{timeZone:REVE_CREDENTIAL_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',minute:'2-digit',second:'2-digit'});
const parts=timestamp=>Object.fromEntries(dateFormat.formatToParts(timestamp).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
function calendarDayUtc(timestamp){const local=parts(timestamp);return Date.UTC(local.year,local.month-1,local.day);}
function nextMadridMidnight(expiresDay){
 const target=expiresDay+dayMs;
 let instant=target;
 // Convert the following calendar midnight to UTC without assuming a fixed
 // UTC offset or a 24-hour local day around daylight-saving transitions.
 for(let i=0;i<3;i++){
  const p=parts(instant),represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  instant+=target-represented;
 }
 return instant;
}
function parseExpiry(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const epoch=Date.parse(value+'T00:00:00.000Z');
 if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==value)return null;
 return epoch;
}
export function assessReveCredential({configured=false,expiresOn=DEFAULT_REVE_API_KEY_EXPIRES_ON,now=Date.now()}={}){
 if(!Number.isFinite(now)||!Number.isFinite(new Date(now).valueOf()))throw Error('Invalid credential-check date');
 const expiryDay=parseExpiry(expiresOn),validDate=expiryDay!==null;
 const expiryInstant=validDate?nextMadridMidnight(expiryDay):null;
 const expired=validDate&&now>=expiryInstant;
 const daysRemaining=validDate?Math.max(0,Math.round((expiryDay-calendarDayUtc(now))/dayMs)):null;
 const warningThresholdDays=validDate&&!expired?(daysRemaining<=7?7:daysRemaining<=30?30:daysRemaining<=60?60:null):null;
 const status=!configured?'not_configured':!validDate?'invalid_expiry':expired?'expired':warningThresholdDays!==null?'expiring':'valid';
 return {configured:!!configured,expiresOn:validDate?expiresOn:null,expiresAt:validDate?new Date(expiryInstant).toISOString():null,timeZone:REVE_CREDENTIAL_TIME_ZONE,daysRemaining,status,canRequest:!!configured&&validDate&&!expired,warningThresholdDays,automaticRenewalSupported:false,renewalUrl:'https://www.mapareve.es/api-contacto'};
}
