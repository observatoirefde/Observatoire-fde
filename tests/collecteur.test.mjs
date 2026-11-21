// Tests du collecteur Bluesky (node tests/collecteur.test.mjs).
// L'API Bluesky est simulée : les comptes et publications ci-dessous sont des
// exemples de structure réservés aux tests, jamais écrits dans data/.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {synchroniser} from '../collecteur/bluesky-liste.mjs';
const VB = createRequire(import.meta.url)('../veille-bluesky.js');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

// ---------- API simulée ----------
const A = {did:'did:plc:aaa', handle:'a.test', displayName:'Député A'};
const B = {did:'did:plc:bbb', handle:'b.test', displayName:'Sénatrice B'};
const X = {did:'did:plc:xxx', handle:'x.test', displayName:'Hors liste'};
const post = (who, rk, date, extra={}) => ({post:{uri:`at://${who.did}/app.bsky.feed.post/${rk}`, cid:'c'+rk, author:who, indexedAt:date, record:{text:'Texte '+rk, createdAt:date, ...(extra.record||{})}}, ...extra.item});
function api(state){
  return async (nsid, p) => {
    state.calls.push(nsid);
    if(state.down) { const e = new Error(nsid+' : HTTP 503'); e.status = 503; throw e; }
    if(nsid==='app.bsky.graph.getList') return {list:{name:'Liste test', creator:{handle:'obs.test'}}, items:state.members.map(s=>({subject:s}))};
    if(nsid==='app.bsky.feed.getListFeed') return {feed:state.listFeed};
    if(nsid==='app.bsky.feed.getAuthorFeed') return {feed:state.author[p.actor]||[]};
    throw new Error('appel inattendu '+nsid);
  };
}
function disque(){
  const f = {};
  return {f, lire:async k=>f[k]?JSON.parse(f[k]):null, ecrire:async (k,v)=>{ f[k]=v; }, supprimer:async k=>{ delete f[k]; }};
}
const config = {bluesky:{liste:'https://bsky.app/profile/did:plc:obs/lists/3abc'}};
const all = d => Object.entries(d.f).filter(([k])=>/^\d{4}-\d{2}\.json$/.test(k)).flatMap(([,v])=>JSON.parse(v).publications);

await t('lien de liste → AT-URI', ()=>{
  assert.equal(VB.listUrlToUri('https://bsky.app/profile/did:plc:rvq2dxmonozuibiezjahmnsk/lists/3n2qx7zvf5q2t').uri, 'at://did:plc:rvq2dxmonozuibiezjahmnsk/app.bsky.graph.list/3n2qx7zvf5q2t');
  const h = VB.listUrlToUri('https://bsky.app/profile/obs.bsky.social/lists/3abc'); assert.equal(h.uri, null); assert.equal(h.repo, 'obs.bsky.social');
  assert.throws(()=>VB.listUrlToUri('https://example.org/profile/x/lists/y'));
  assert.throws(()=>VB.listUrlToUri('https://bsky.app/profile/x/post/y'));
});

const S = {calls:[], members:[A,B], listFeed:[], author:{}};
S.listFeed = [post(A,'a1','2026-11-19T10:00:00Z'), post(X,'x1','2026-11-19T09:00:00Z')];           // X n'est pas membre
S.author[A.did] = [post(A,'a1','2026-11-19T10:00:00Z'), post(A,'a0','2026-10-02T08:00:00Z', {record:{reply:{}}})];
S.author[B.did] = [post(X,'x2','2026-11-18T12:00:00Z', {item:{reason:{$type:'app.bsky.feed.defs#reasonRepost', by:B, indexedAt:'2026-11-19T11:00:00Z'}}}),
                   post(B,'b1','2026-11-17T12:00:00Z')];
const D = disque();
const now = () => new Date('2026-11-20T12:00:00Z');

await t('1er passage : membres, vérification de provenance, reposts', async ()=>{
  const {run, etat} = await synchroniser({config, get:api(S), ...D, maintenant:now});
  assert.equal(run.ok, true);
  assert.deepEqual(run.ajouts.sort(), ['a.test','b.test']);
  assert.equal(run.rejetees, 1);                                       // la publication de X (hors liste) est refusée
  const P = all(D);
  assert.equal(P.length, 4);
  assert.ok(!P.some(p=>p.id.endsWith('/x1')));
  const rp = P.find(p=>p.type==='repost'); assert.equal(rp.did, B.did); assert.equal(rp.author.handle, 'x.test'); assert.equal(rp.date, '2026-11-19T11:00:00Z');
  assert.equal(P.find(p=>p.id.endsWith('/a0')).type, 'reply');
  assert.deepEqual(Object.keys(etat.mois), ['2026-11','2026-10']);    // un fichier par mois
  assert.ok(D.f['2026-11.json'] && D.f['2026-10.json']);
  assert.equal(etat.derniere_synchro_reussie, '2026-11-20T12:00:00.000Z');
  assert.ok(etat.membres.every(m=>m.historique_fait && m.actif));
});

await t('2e passage identique : aucun doublon, aucun fichier mensuel réécrit', async ()=>{
  const {run, fichiers} = await synchroniser({config, get:api(S), ...D, maintenant:()=>new Date('2026-11-20T12:30:00Z')});
  assert.equal(run.nouvelles, 0); assert.equal(run.mises_a_jour, 0);
  assert.deepEqual(fichiers, ['etat.json']);
  assert.equal(all(D).length, 4);
});

await t('retrait d\'un membre : collecte arrêtée, historique conservé', async ()=>{
  S.members = [A]; S.calls = [];
  S.listFeed.push(post(B,'b2','2026-11-20T12:40:00Z'));                // B n'est plus membre : refusé
  const {run, etat} = await synchroniser({config, get:api(S), ...D, maintenant:()=>new Date('2026-11-20T13:00:00Z')});
  assert.deepEqual(run.retraits, ['b.test']);
  const b = etat.membres.find(m=>m.did===B.did); assert.equal(b.actif, false); assert.ok(b.retire_le);
  assert.ok(!all(D).some(p=>p.id.endsWith('/b2')));
  assert.ok(all(D).some(p=>p.id.endsWith('/b1')));                    // ancien historique conservé
  assert.equal(S.calls.filter(c=>c==='app.bsky.feed.getAuthorFeed').length, 1);
});

await t('nouveau membre : historique initial collecté', async ()=>{
  S.members = [A, X]; S.author[X.did] = [post(X,'x3','2026-11-15T08:00:00Z')];
  const {run} = await synchroniser({config, get:api(S), ...D, maintenant:()=>new Date('2026-11-20T13:30:00Z')});
  assert.deepEqual(run.ajouts, ['x.test']);
  assert.ok(all(D).some(p=>p.id.endsWith('/x3')));
});

await t('publication supprimée par son auteur : retirée de l\'historique', async ()=>{
  S.author[A.did] = [post(A,'a0','2026-10-02T08:00:00Z', {record:{reply:{}}})];   // a1 a disparu du fil de A
  S.listFeed = [];
  const {run} = await synchroniser({config, get:api(S), ...D, maintenant:()=>new Date('2026-11-20T14:00:00Z')});
  assert.equal(run.supprimees, 1);
  assert.ok(!all(D).some(p=>p.id.endsWith('/a1')));
});

await t('liste inaccessible : échec enregistré, historique intact', async ()=>{
  const avant = all(D).length; S.down = true;
  const {run, etat} = await synchroniser({config, get:api(S), ...D, maintenant:()=>new Date('2026-11-20T14:30:00Z')});
  S.down = false;
  assert.equal(run.ok, false); assert.ok(run.erreurs.length);
  assert.equal(etat.derniere_synchro, '2026-11-20T14:30:00.000Z');
  assert.equal(etat.derniere_synchro_reussie, '2026-11-20T14:00:00.000Z');   // l'indicateur garde la dernière réussite
  assert.equal(all(D).length, avant);
  assert.equal(JSON.parse(D.f['etat.json']).journal[0].ok, false);
});

await t('panne d\'un seul compte : les autres sont collectés', async ()=>{
  S.members = [A, X]; const g = api(S);
  const get = async (nsid, p) => { if(nsid==='app.bsky.feed.getAuthorFeed' && p.actor===X.did){ const e = new Error('HTTP 400 AccountDeactivated'); e.status = 400; throw e; } return g(nsid, p); };
  S.author[A.did].unshift(post(A,'a9','2026-11-20T14:50:00Z'));
  const {run, etat} = await synchroniser({config, get, ...D, maintenant:()=>new Date('2026-11-20T15:00:00Z')});
  assert.equal(run.ok, true); assert.equal(run.erreurs.length, 1);
  assert.ok(etat.membres.find(m=>m.did===X.did).derniere_erreur);
  assert.ok(all(D).some(p=>p.id.endsWith('/a9')));
});
console.log(`\n${n} tests réussis`);
