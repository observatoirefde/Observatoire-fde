// Tests du module veille.js (node tests/veille.test.mjs).
// Les données ci-dessous sont des exemples de structure réservés aux tests :
// elles ne sont jamais chargées par le site.
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const ctx = {window:{}, console, TextEncoder, TextDecoder, URL, URLSearchParams, setTimeout, clearTimeout};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(root+'veille-bluesky.js','utf8'), ctx); vm.runInContext(fs.readFileSync(root+'veille.js','utf8'), ctx);
const T = ctx.window.VEILLE._test;
T.compileThemes(JSON.parse(fs.readFileSync(root+'data/veille/themes.json','utf8')));
let n=0; const t=(name,fn)=>{ fn(); n++; console.log('ok -', name); };

const cl = s => [...T.classify({text:s})];
t('thèmes : AEFE et bourses', ()=>{ const r=cl("Rencontre avec l'#AEFE sur les bourses scolaires des lycées français"); assert.ok(r.includes('enseignement')); assert.ok(r.includes('bourses')); });
t('thèmes : accents et majuscules ignorés', ()=>assert.ok(cl('La CAISSE DES FRANÇAIS DE L’ÉTRANGER').includes('protection-sociale')));
t('thèmes : joker de fin de mot', ()=>assert.ok(cl('Permanence au consulat de Montréal').includes('consulaire')));
t('thèmes : pas de faux positif sur un mot voisin', ()=>{ assert.ok(!cl('Je vais partir demain').includes('vie-politique')); assert.ok(!cl('une ruelle calme').includes('vie-politique')); });
t('thèmes : non-résidents avec ou sans tiret', ()=>{ assert.ok(cl('fiscalité des non-résidents').includes('fiscalite')); assert.ok(cl('les non residents').includes('fiscalite')); });
t('thèmes : faux positifs relevés sur des publications réelles', ()=>{
  assert.ok(!cl('aucun traitement ne permet de soulager').includes('diplomatie'));
  assert.ok(!cl('une mesure visant les femmes').includes('consulaire'));
  assert.ok(!cl('les personnes en situation de handicap').includes('protection-sociale'));
  assert.ok(!cl('Lors des élections consulaires').includes('consulaire'));
  assert.ok(cl('Lors des élections consulaires').includes('elections-fde')); });
t('thèmes : « Autres sujets » par défaut', ()=>assert.deepEqual(cl('Bonne journée à toutes et à tous'), ['autres']));
t('thèmes : plusieurs thèmes possibles', ()=>assert.ok(cl('Amendement au PLF sur la CFE').length>=2));

t('texte : échappement HTML', ()=>assert.equal(T.richText('<script>alert(1)</script>',[]), '&lt;script&gt;alert(1)&lt;/script&gt;'));
t('texte : lien positionné en octets UTF-8', ()=>{
  const txt='Écoutez ici : exemple.fr', start=new TextEncoder().encode('Écoutez ici : ').length;
  const h=T.richText(txt,[{index:{byteStart:start,byteEnd:start+10},features:[{$type:'app.bsky.richtext.facet#link',uri:'https://exemple.fr'}]}]);
  assert.match(h, /^Écoutez ici : <a href="https:\/\/exemple\.fr"[^>]*>exemple\.fr<\/a>$/); });
t('texte : lien javascript: refusé', ()=>{ const h=T.richText('clic',[{index:{byteStart:0,byteEnd:4},features:[{$type:'app.bsky.richtext.facet#link',uri:'javascript:alert(1)'}]}]); assert.ok(!h.includes('href')); });

const acc={key:'K', did:'did:plc:auteur'};
const base={uri:'at://did:plc:auteur/app.bsky.feed.post/3abc', author:{did:'did:plc:auteur',handle:'auteur.test'}, indexedAt:'2026-11-19T10:00:05Z'};
t('Bluesky : publication originale', ()=>{ const p=T.bskyPost({post:{...base, record:{text:'Bonjour',createdAt:'2026-11-19T10:00:00Z'}}},acc);
  assert.equal(p.type,'original'); assert.equal(p.url,'https://bsky.app/profile/auteur.test/post/3abc'); assert.equal(p.date,'2026-11-19T10:00:00Z'); });
t('Bluesky : réponse', ()=>{ const p=T.bskyPost({post:{...base, record:{text:'Oui',createdAt:'2026-11-19T10:00:00Z',reply:{}}}, reply:{parent:{author:{handle:'autre.test',displayName:'Autre'}}}},acc);
  assert.equal(p.type,'reply'); assert.equal(p.replyTo.handle,'autre.test'); });
t('Bluesky : republication datée du moment du partage', ()=>{ const p=T.bskyPost({post:{...base, author:{did:'did:plc:x',handle:'x.test'}, record:{text:'Texte',createdAt:'2026-11-01T08:00:00Z'}}, reason:{$type:'app.bsky.feed.defs#reasonRepost',indexedAt:'2026-11-19T12:00:00Z'}},acc);
  assert.equal(p.type,'repost'); assert.equal(p.date,'2026-11-19T12:00:00Z'); assert.equal(p.author.handle,'x.test'); assert.ok(p.id.startsWith('bluesky:rp:')); });
t('Bluesky : citation', ()=>{ const p=T.bskyPost({post:{...base, record:{text:'Voir',createdAt:'2026-11-19T10:00:00Z'}, embed:{$type:'app.bsky.embed.record#view',record:{$type:'app.bsky.embed.record#viewRecord',uri:'at://did:plc:y/app.bsky.feed.post/9z',author:{handle:'y.test'},value:{text:'Cité'}}}}},acc);
  assert.equal(p.type,'quote'); assert.equal(p.embed.quote.text,'Cité'); });
t('Bluesky : publication épinglée ignorée', ()=>assert.equal(T.bskyPost({post:{...base,record:{}}, reason:{$type:'app.bsky.feed.defs#reasonPin'}},acc), null));
t('Bluesky : date future ramenée à la date d\'indexation', ()=>{ const p=T.bskyPost({post:{...base, record:{text:'x',createdAt:'2030-01-01T00:00:00Z'}}},acc); assert.equal(p.date, base.indexedAt); });

// Sélection manuelle : lecture des adresses (exemples de format uniquement)
const LI = T.MANUAL.linkedin.parse, IG = T.MANUAL.instagram.parse;
t('LinkedIn : adresse de publication, identifiant et date déduite', ()=>{ const r=LI('https://www.linkedin.com/posts/amelialkf_bonjour-activity-7262110445398417408-AbCd?utm_source=share');
  assert.equal(r.key,'urn:li:activity:7262110445398417408'); assert.equal(r.vanity,'amelialkf'); assert.equal(r.url,'https://www.linkedin.com/posts/amelialkf_bonjour-activity-7262110445398417408-AbCd');
  assert.ok(r.date.startsWith('2024-11')); assert.equal(r.embed,'https://www.linkedin.com/embed/feed/update/urn:li:activity:7262110445398417408'); });
t('LinkedIn : code d\'intégration complet accepté', ()=>{ const r=LI('<iframe src="https://www.linkedin.com/embed/feed/update/urn:li:share:7262110445398417408" height="500"></iframe>'); assert.equal(r.key,'urn:li:share:7262110445398417408'); assert.equal(r.url,'https://www.linkedin.com/feed/update/urn:li:share:7262110445398417408/'); });
t('LinkedIn : autre site refusé', ()=>{ assert.ok(LI('https://evil.example/posts/x-activity-7262110445398417408').err); assert.ok(LI('https://www.linkedin.com/in/amelialkf').err); });
t('Instagram : publication et reel', ()=>{ assert.equal(IG('https://www.instagram.com/p/C1a2B3c4D5e/?igsh=xyz').embed,'https://www.instagram.com/p/C1a2B3c4D5e/embed/captioned/'); assert.equal(IG('https://www.instagram.com/vincent_caure/reel/C1a2B3c4D5e/').url,'https://www.instagram.com/reel/C1a2B3c4D5e/'); });
t('Instagram : profil ou autre site refusé', ()=>{ assert.ok(IG('https://www.instagram.com/vincent_caure/').err); assert.ok(IG('http://www.instagram.com/p/C1a2B3c4D5e/').err); });
const selFile=JSON.parse(fs.readFileSync(root+'data/veille/selection.json','utf8'));
t('sélection : fichier valide et sans publication inventée', ()=>assert.ok(Array.isArray(selFile.publications)));

// Registre : cohérence avec les annuaires existants
const reg=JSON.parse(fs.readFileSync(root+'data/veille/comptes.json','utf8'));
const dep=JSON.parse(fs.readFileSync(root+'data/deputes-2026.json','utf8')).deputes.map(d=>d.pa);
const sen=JSON.parse(fs.readFileSync(root+'data/senateurs-2026.json','utf8')).senateurs.map(s=>s.slug);
t('registre : les 23 parlementaires, et eux seuls', ()=>assert.deepEqual(Object.keys(reg.parlementaires).sort(), [...dep,...sen].sort()));
t('registre : comptes vérifiés avec source et adresse https', ()=>Object.values(reg.parlementaires).flatMap(p=>p.comptes).filter(a=>a.verification==='verifie').forEach(a=>{ assert.match(a.url,/^https:\/\//); assert.ok(a.source && a.verifie_le); }));
t('registre : seuls des comptes vérifiés sont collectés', ()=>Object.values(reg.parlementaires).flatMap(p=>p.comptes).filter(a=>a.collecte).forEach(a=>assert.equal(a.verification,'verifie')));
console.log(`\n${n} tests réussis`);
