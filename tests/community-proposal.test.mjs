import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCommunityProposal,communityEntries} from '../src/community-proposal.mjs';
const point={name:'Punto aportado',address:'Madrid',instructions:'Consultar condiciones al establecimiento',lat:40.4,lng:-3.7,power_kw:22,connector:'Tipo2'};
const body=value=>'<!-- CARGAGRATIS_POINT\n'+JSON.stringify(value)+'\n-->';

test('community records preserve user text without becoming verified stations',()=>{
 const parsed=parseCommunityProposal(body({...point,price:0,verified:true}));
 assert.deepEqual(parsed,point);
 assert.equal(parsed.price,undefined);
 assert.equal(parsed.verified,undefined);
});
test('malformed issue fields cannot reach React or become charging data',()=>{
 for(const change of [{name:{text:'Object'}},{name:''},{address:null},{instructions:[]},{lat:'40.4'},{lng:181},{power_kw:-1},{power_kw:1001},{connector:'invented'}])assert.equal(parseCommunityProposal(body({...point,...change})),null);
 for(const value of [null,{},'<!-- CARGAGRATIS_POINT\nnot json\n-->','x'.repeat(100001)])assert.equal(parseCommunityProposal(value),null);
});
test('community list skips invalid entries and normalizes reaction counts',()=>{
 const entries=communityEntries([null,{number:1,state:'open',body:body(point),html_url:'javascript:bad',reactions:{'+1':{},'-1':-2}},{number:2,state:'closed',body:body(point)},{number:3,state:'open',body:body({...point,name:[]})}]);
 assert.deepEqual(entries,[{number:1,proposal:point,yes:0,no:0}]);
 assert.throws(()=>communityEntries({message:'rate limited'}));
});
