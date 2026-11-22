// Tests du collecteur Instagram (node tests/instagram.test.mjs).
// L'API Graph est simulée : les comptes et publications ci-dessous sont des
// exemples de structure réservés aux tests, jamais écrits dans data/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {synchroniser, toPost, analyserErreur, comptesSuivis} from '../collecteur/instagram.mjs';
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

const media = (id, date, extra={}) => ({id, caption:'Légende '+id, media_type:'IMAGE', media_product_type:'FEED', permalink:`https://www.instagram.com/p/${id}/`, timestamp:date, ...extra});
const S = {calls:[], comptes:{}, erreurs:{}};
const graphErr = (code, msg, sub) => { const e = new Error(msg); e.graph = {code, message:msg, error_subcode:sub}; e.status = 400; return e; };
const get = async (u, {limit, after}) => {
  S.calls.push(u+(after?'@'+after:''));
  if(S.erreurs[u]) throw S.erreurs[u];
  const all = S.comptes[u]||[], start = after ? +after : 0, page = all.slice(start, start+limit);
  return {username:u, name:'Nom '+u, media_count:all.length, media:{data:page, paging:{cursors:{after: start+limit<all.length ? String(start+limit) : undefined}}}};
};
function disque(){ const f = {}; return {f, lire:async k=>f[k]?JSON.parse(f[k]):null, ecrire:async (k,v)=>{ f[k]=v; }, supprimer:async k=>{ delete f[k]; }}; }
const all = d => Object.entries(d.f).filter(([k])=>/^\d{4}-\d{2}\.json$/.test(k)).flatMap(([,v])=>JSON.parse(v).publications);
const config = {instagram:{par_page:2, pages_max:4}};
const comptes = [{pid:'PA1', nom:'Député A', username:'compte_a'}, {pid:'S1', nom:'Sénatrice B', username:'compte_b'}];

await t('conversion : date Instagram, Reel, lien', ()=>{
  const p = toPost(media('1','2026-11-20T21:23:53+0000',{media_product_type:'REELS', media_type:'VIDEO', permalink:'https://www.instagram.com/reel/AbC/'}), 'compte_a');
  assert.equal(p.date, '2026-11-20T21:23:53.000Z'); assert.equal(p.type, 'reel'); assert.equal(p.id, 'instagram:1'); assert.equal(p.url, 'https://www.instagram.com/reel/AbC/');
  assert.equal(toPost({id:'2', timestamp:'n/a', permalink:'x'}, 'a'), null);
});
await t('erreurs : jeton, compte personnel, limite', ()=>{
  assert.ok(analyserErreur(graphErr(190,'Invalid OAuth')).global);
  const p = analyserErreur(graphErr(110,'Invalid user id')); assert.equal(p.global, false); assert.equal(p.statut, 'introuvable');
  assert.ok(analyserErreur(graphErr(4,'Application request limit reached')).global);
  assert.ok(/permission/i.test(analyserErreur(graphErr(10,'Application does not have permission')).message));
});
await t('registre : comptes Instagram indiqués, vérifiés ou non, sauf collecte désactivée', ()=>{
  const reg = {parlementaires:{PA1:{comptes:[{reseau:'instagram', identifiant:'a', verification:'verifie'}, {reseau:'x', identifiant:'b', verification:'verifie'}]}, PA2:{comptes:[{reseau:'instagram', identifiant:'@c', verification:'a_verifier'}]}, PA3:{comptes:[{reseau:'instagram', identifiant:'d', verification:'a_verifier', collecte:false}]}}};
  assert.deepEqual(comptesSuivis(reg, [{pa:'PA1', prenom:'Jean', nom:'Dupont'}], []), [{pid:'PA1', nom:'Jean Dupont', username:'a', verifie:true}, {pid:'PA2', nom:'PA2', username:'c', verifie:false}]);
  const vrai = JSON.parse(fs.readFileSync(new URL('../data/veille/comptes.json', import.meta.url)));
  assert.equal(comptesSuivis(vrai, [], []).length, 16);
});

const D = disque();
S.comptes.compte_a = [media('a3','2026-11-21T08:00:00+0000',{media_product_type:'REELS', media_type:'VIDEO'}), media('a2','2026-11-10T08:00:00+0000'), media('a1','2026-10-05T08:00:00+0000')];
S.erreurs.compte_b = graphErr(110, 'Invalid user id', 2207013);
await t('1er passage : historique initial paginé, compte personnel signalé', async ()=>{
  const {run, etat, nouvelles, recap} = await synchroniser({comptes, config, get, ...D, maintenant:()=>new Date('2026-11-22T06:17:00Z')});
  assert.equal(run.ok, true); assert.equal(run.comptes_lus, 1);
  assert.equal(all(D).length, 3); assert.deepEqual(Object.keys(etat.mois), ['2026-11','2026-10']);
  assert.equal(nouvelles.length, 0);                                     // historique initial : pas listé comme « nouveau »
  assert.equal(etat.comptes.compte_b.statut, 'introuvable');
  assert.match(recap, /Comptes collectés pour la première fois/); assert.match(recap, /@compte\\_a → Député A/);
  assert.match(recap, /Comptes non lus/); assert.match(recap, /non professionnel/);
});
await t('2e passage : nouvelle publication détectée, aucun doublon, une seule requête', async ()=>{
  S.calls = []; S.comptes.compte_a.unshift(media('a4','2026-11-22T12:00:00+0000'));
  const {run, nouvelles, recap} = await synchroniser({comptes, config, get, ...D, maintenant:()=>new Date('2026-11-22T17:17:00Z')});
  assert.equal(run.nouvelles, 1); assert.equal(nouvelles[0].id, 'instagram:a4'); assert.equal(all(D).length, 4);
  assert.deepEqual(S.calls, ['compte_a','compte_b']);                   // pas de pagination inutile
  assert.match(recap, /1 nouvelle publication/); assert.match(recap, /https:\/\/www\.instagram\.com\/p\/a4\//); assert.match(recap, /22\/11\/2026 13:00/);
});
await t('rattrapage : si toute la page est nouvelle, la page suivante est lue', async ()=>{
  S.calls = []; S.comptes.compte_a.unshift(media('a6','2026-11-23T10:00:00+0000',{media_product_type:'REELS'}), media('a5','2026-11-23T09:00:00+0000'));
  const {nouvelles, recap} = await synchroniser({comptes, config, get, ...D, maintenant:()=>new Date('2026-11-23T17:17:00Z')});
  assert.equal(nouvelles.length, 2); assert.ok(S.calls.includes('compte_a@2')); assert.match(recap, /dont 1 Reel/);
});
await t('collecte horaire sans récapitulatif, puis récapitulatif cumulé', async ()=>{
  S.comptes.compte_a.unshift(media('a7','2026-11-23T20:00:00+0000'));
  let r = await synchroniser({comptes, config, get, ...D, recap:false, maintenant:()=>new Date('2026-11-23T20:23:00Z')});
  assert.equal(r.run.nouvelles, 1); assert.equal(r.recap, '');
  S.comptes.compte_a.unshift(media('a8','2026-11-23T21:00:00+0000'));
  r = await synchroniser({comptes, config, get, ...D, recap:false, maintenant:()=>new Date('2026-11-23T21:23:00Z')});
  r = await synchroniser({comptes, config, get, ...D, recap:true, maintenant:()=>new Date('2026-11-24T07:23:00Z')});
  assert.equal(r.run.nouvelles, 0);
  assert.match(r.recap, /2 nouvelles publications/); assert.match(r.recap, /p\/a7\//); assert.match(r.recap, /p\/a8\//);
  assert.match(r.recap, /depuis le récapitulatif du 23\/11\/2026 18:17/);
  r = await synchroniser({comptes, config, get, ...D, recap:true, maintenant:()=>new Date('2026-11-24T08:23:00Z')});
  assert.match(r.recap, /Aucune nouvelle publication/);              // rien n'est répété
});
await t('publication supprimée : retirée après deux passages', async ()=>{
  S.comptes.compte_a = S.comptes.compte_a.filter(m=>m.id!=='a7');
  let r = await synchroniser({comptes, config, get, ...D, maintenant:()=>new Date('2026-11-24T09:17:00Z')});
  assert.equal(r.run.supprimees, 0); assert.ok(all(D).some(p=>p.id==='instagram:a7'));
  r = await synchroniser({comptes, config, get, ...D, maintenant:()=>new Date('2026-11-24T17:18:00Z')});
  assert.equal(r.run.supprimees, 1); assert.ok(!all(D).some(p=>p.id==='instagram:a7'));
});
await t('jeton invalide : collecte interrompue, historique intact, alerte', async ()=>{
  const avant = all(D).length; S.erreurs.compte_a = graphErr(190, 'Error validating access token');
  const {run, etat, recap} = await synchroniser({comptes, config, get, ...D, maintenant:()=>new Date('2026-11-25T06:17:00Z')});
  delete S.erreurs.compte_a;
  assert.equal(run.ok, false); assert.equal(all(D).length, avant);
  assert.equal(etat.derniere_synchro_reussie, '2026-11-24T17:18:00.000Z');
  assert.match(recap, /Collecte interrompue/); assert.match(recap, /IG\\?_TOKEN/);
});
await t('compte retiré du registre : historique conservé, plus de collecte', async ()=>{
  S.calls = [];
  const {etat} = await synchroniser({comptes:[comptes[1]], config, get, ...D, maintenant:()=>new Date('2026-11-25T17:17:00Z')});
  assert.equal(etat.comptes.compte_a.actif, false); assert.ok(!S.calls.includes('compte_a'));
  assert.ok(all(D).some(p=>p.compte==='compte_a'));
});
console.log(`\n${n} tests réussis`);
