// Tests de la veille du contentieux électoral (collecteur/contentieux.mjs) et des fichiers éditoriaux.
// Lancés avant chaque collecte par le workflow « Veille contentieux ».   node tests/contentieux.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as C from '../collecteur/contentieux.mjs';

let ok = 0;
const test = (nom, f) => { try { f(); ok++; } catch (e) { console.error('ÉCHEC : ' + nom + '\n' + e.stack); process.exit(1); } };

// archive ZIP minimale (une entrée stockée, une compressée)
function zip(entrees) {
  const locaux = [], centraux = []; let offset = 0;
  for (const [nom, texte, compresser] of entrees) {
    const brut = Buffer.from(texte, 'utf8'), data = compresser ? zlib.deflateRawSync(brut) : brut, n = Buffer.from(nom);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(compresser ? 8 : 0, 8); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(brut.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(compresser ? 8 : 0, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(brut.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locaux.push(l, n, data); centraux.push(c, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centraux), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entrees.length, 8); e.writeUInt16LE(entrees.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locaux, cd, e]);
}
const xml = (num, date, texte, type = 'Décision', sol = 'Rejet') => `<?xml version="1.0" encoding="UTF-8"?><Document><Dossier><Code_Juridiction>CE</Code_Juridiction><Numero_Dossier>${num}</Numero_Dossier><Date_Lecture>${date}</Date_Lecture><Numero_ECLI>ECLI:FR:CECHS:2026:${num}.${date.replace(/-/g, '')}</Numero_ECLI><Type_Decision>${type}</Type_Decision><Solution>${sol}</Solution></Dossier><Audience><Formation_Jugement>3ème chambre jugeant seule</Formation_Jugement></Audience><Decision><Texte_Integral>${texte}</Texte_Integral></Decision></Document>`;

const CFDE = "Vu la procédure suivante :<br/>Par une protestation enregistrée le 4 juin 2026, Mme X... demande l’annulation des opérations électorales en vue de l’élection des conseillers des Français de l’étranger dans la circonscription électorale des Emirats arabes unis et Oman.<br/>Rejet.";
const VISA = "M. A... demande l'annulation de la décision par laquelle les autorités consulaires françaises à Alger ont refusé de lui délivrer un visa de long séjour. Les élections ne sont pas en cause.";
const MUNI = "Les opérations électorales du 15 mars 2026 en vue de l'élection des conseillers municipaux de Campi. Des procurations ont été établies au consulat de France à Abidjan.";
const SENAT = "Il demande de suspendre la nuance attribuée pour l'élection des sénateurs représentant les Français établis hors de France.";
const AFE = "M. B... demande au Conseil d'Etat d'annuler l'élection des conseillers à l'Assemblée des Français de l'étranger dans la circonscription Afrique du Nord.";
const JOINTS = "I. Sous le n° 516540, par une protestation, Mme Y... ; II. Sous le n° 516541, M. Z... Les opérations électorales de 2026.";

const NOMS = ['Emirats arabes unis, Oman', 'Etats-Unis - 1re circonscription', 'Etats-Unis - 2e circonscription', 'Afrique du Nord'];
const ctx0 = () => C.contexte({ recours: [] }, { ecartees: [] }, NOMS);
const lire = x => C.lireDecision(x);

test('lecture ZIP : entrées stockées et compressées', () => {
  const f = C.lireZip(zip([['a.xml', 'élection', false], ['b.xml', 'protestation'.repeat(50), true]]));
  assert.deepEqual(f.map(x => x.nom), ['a.xml', 'b.xml']);
  assert.equal(f[0].contenu.toString(), 'élection');
  assert.equal(f[1].contenu.toString(), 'protestation'.repeat(50));
  assert.throws(() => C.lireZip(Buffer.from('<html>404</html>')), /illisible/);
});

test('lecture XML : balises, entités, sauts de ligne', () => {
  const d = lire(xml('516536', '2026-11-04', 'A &amp; B<br/>C &#233;'));
  assert.equal(d.numero, '516536'); assert.equal(d.date, '2026-11-04'); assert.equal(d.solution, 'Rejet');
  assert.equal(d.formation, '3ème chambre jugeant seule');
  assert.match(d.texte, /A & B\nC é/);
});

test('détection : CFDE retenu, circonscription reconnue', () => {
  const h = C.analyser(lire(xml('516536', '2026-11-04', CFDE)), ctx0());
  assert.ok(h); assert.equal(h.scrutin, 'CFDE'); assert.deepEqual(h.circonscriptions, ['Emirats arabes unis, Oman']);
  assert.ok(h.score >= 5); assert.match(h.extrait, /conseillers des Français/); assert.equal(h.recours, null);
  assert.equal(h.source, 'https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2026-11-04/516536');
});

test('détection : AFE retenu', () => {
  const h = C.analyser(lire(xml('517000', '2026-10-01', AFE)), ctx0());
  assert.equal(h.scrutin, 'AFE'); assert.deepEqual(h.circonscriptions, ['Afrique du Nord']);
});

test('détection : visas, municipales et sénatoriales ignorés', () => {
  for (const t of [VISA, MUNI, SENAT]) assert.equal(C.analyser(lire(xml('500000', '2026-07-01', t)), ctx0()), null, t.slice(0, 40));
});

test('circonscriptions : plusieurs du même pays regroupées', () => {
  const h = C.analyser(lire(xml('517001', '2026-10-01', "Protestation contre l'élection des conseillers des Français de l'étranger aux Etats-Unis.")), ctx0());
  assert.deepEqual(h.circonscriptions, ['Etats-Unis (circonscription à préciser)']);
});

test('numéros : normalisation et recours joints', () => {
  assert.deepEqual(C.numeros('516 536'), ['516536']);
  assert.deepEqual(C.numeros('516536, 516540'), ['516536', '516540']);
  assert.deepEqual(C.numeros('516539', JOINTS).sort(), ['516539', '516540', '516541']);
});

test('rapprochement : numéro connu (même sans terme électoral), recours joint, ECLI', () => {
  const ctx = C.contexte({ recours: [{ id: 'r1', numeros_ce: ['516540'] }, { id: 'r2', numeros_ce: [], ecli: ['ECLI:FR:CECHS:2026:600000.20261201'] }] }, { ecartees: [] }, NOMS);
  assert.equal(C.analyser(lire(xml('516540', '2026-12-01', 'Ordonnance de clôture.')), ctx).recours, 'r1');
  assert.equal(C.analyser(lire(xml('516539', '2026-12-01', JOINTS)), ctx).recours, 'r1');
  assert.equal(C.analyser(lire(xml('600000', '2026-12-01', 'Texte.')), ctx).recours, 'r2');
});

test('archive : format inattendu = échec explicite (jamais « aucune décision »)', () => {
  const mauvais = C.lireZip(zip([['a.xml', '<Document><Autre>1</Autre></Document>', false], ['b.xml', '<Document/>', true]]));
  assert.throws(() => C.analyserArchive(mauvais, ctx0(), '202606'), /format inattendu/);
  assert.throws(() => C.analyserArchive([], ctx0(), '202606'), /aucune décision XML/);
  const bon = C.lireZip(zip([['a.xml', xml('516536', '2026-11-04', CFDE), true], ['b.xml', xml('500000', '2026-11-04', VISA), false]]));
  const r = C.analyserArchive(bon, ctx0(), '202611');
  assert.equal(r.fichiers, 2); assert.equal(r.hits.length, 1); assert.equal(r.hits[0].archive, '202611');
});

test('résultat : doublons, décisions écartées, nouvelles et date de première détection', () => {
  const ctx = C.contexte({ recours: [] }, { ecartees: [{ numero: '517000' }] }, NOMS);
  const h1 = C.analyser(lire(xml('516536', '2026-11-04', CFDE)), ctx), h1bis = { ...h1 };
  const h2 = C.analyser(lire(xml('517000', '2026-10-01', AFE)), ctx);
  const h3 = C.analyser(lire(xml('517001', '2026-10-02', CFDE)), ctx);
  const precedent = { decisions: [{ numero: '516536', date: '2026-11-04', premiere_detection: '2026-11-10' }] };
  const r = C.resultat({ '202611': 2 }, [h1, h1bis, h2, h3], [], ctx, precedent, '2026-11-22T05:00:00Z');
  assert.deepEqual(r.essentiel.decisions.map(d => d.numero), ['516536', '517001']);
  assert.equal(r.essentiel.decisions[0].premiere_detection, '2026-11-10');
  assert.equal(r.essentiel.decisions[1].premiere_detection, '2026-11-22');
  assert.deepEqual(r.nouvelles.map(d => d.numero), ['517001']);
  assert.equal(r.ecartees_masquees, 1);
  const recap = C.recapitulatif(r.nouvelles, '2026-11-22');
  assert.match(recap, /1 décision à examiner/); assert.match(recap, /n° 517001/); assert.match(recap, /à vérifier/);
  assert.equal(C.recapitulatif([], '2026-11-22'), '');
});

test('mois analysés : de mai 2026 au mois courant', () => {
  assert.deepEqual(C.moisAAnalyser(new Date('2026-07-15T00:00:00Z')), ['202605', '202606', '202607']);
  assert.deepEqual(C.moisAAnalyser(new Date('2027-01-02T00:00:00Z')).slice(-3), ['202611', '202612', '202701']);
});

// ---------- fichiers éditoriaux : une erreur de saisie bloque la collecte au lieu de publier des données fausses ----------
const STATUTS = ['En cours', 'Rejeté', 'Annulation', 'Réformation', 'Désistement', 'Non-lieu'];
test('data/contentieux/recours.json valide', () => {
  const j = JSON.parse(fs.readFileSync(new URL('../data/contentieux/recours.json', import.meta.url)));
  assert.ok(Array.isArray(j.recours)); const ids = new Set();
  for (const r of j.recours) {
    assert.ok(r.id && !ids.has(r.id), 'identifiant manquant ou en double : ' + r.id); ids.add(r.id);
    assert.ok(['CFDE', 'AFE'].includes(r.scrutin), r.id + ' : scrutin CFDE ou AFE');
    assert.ok(STATUTS.includes(r.statut), r.id + ' : statut inconnu « ' + r.statut + ' »');
    assert.ok((r.numeros_ce || []).every(n => /^\d{5,7}$/.test(n)), r.id + ' : numéros de dossier (chiffres, entre guillemets)');
    assert.ok(/^https:\/\//.test(r.source || ''), r.id + ' : source officielle obligatoire');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.verifie_le || ''), r.id + ' : date de vérification AAAA-MM-JJ');
    if (r.statut !== 'En cours') assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date_decision || ''), r.id + ' : date de décision');
  }
});
test('data/contentieux/ecartees.json valide', () => {
  const j = JSON.parse(fs.readFileSync(new URL('../data/contentieux/ecartees.json', import.meta.url)));
  assert.ok(Array.isArray(j.ecartees));
  for (const e of j.ecartees) { assert.ok(/^\d{5,7}$/.test(String(e.numero)), 'numéro écarté : ' + e.numero); assert.ok(e.motif, 'motif obligatoire pour ' + e.numero); }
});

console.log(`Contentieux : ${ok} tests réussis.`);
