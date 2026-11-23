// Tests de la veille institutionnelle (collecteur/institutionnel.mjs) et de ses réglages.
// Lancés avant chaque collecte par le workflow « Veille institutionnelle ».   node tests/institutionnel.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import * as I from '../collecteur/institutionnel.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../data/institutionnel/config.json', import.meta.url)));
let ok = 0; const attente = [];
const test = (nom, f) => { const r = (async () => f())().then(() => ok++, e => { console.error('ÉCHEC : ' + nom + '\n' + e.stack); process.exit(1); }); attente.push(r); };

// archive tar minimale (format ustar)
function tar(entrees) {
  const blocs = [];
  for (const [nom, texte] of entrees) {
    const data = Buffer.from(texte), h = Buffer.alloc(512);
    h.write(nom, 0); h.write('0000644\0', 100); h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write('0', 156); h.write('ustar\0', 257);
    blocs.push(h, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return Buffer.concat([...blocs, Buffer.alloc(1024)]);
}
const texte = ({ id = 'JORFTEXT000055000001', nature = 'ARRETE', nor = 'EAEF2600001A', date = '2026-11-15', titre }) =>
  `<?xml version="1.0" encoding="UTF-8"?><TEXTE_VERSION><META><META_COMMUN><ID>${id}</ID><ORIGINE>JORF</ORIGINE><NATURE>${nature}</NATURE></META_COMMUN><META_SPEC><META_TEXTE_CHRONICLE><CID>${id}</CID><NOR>${nor}</NOR><DATE_PUBLI>${date}</DATE_PUBLI><DATE_TEXTE>2026-11-12</DATE_TEXTE><ORIGINE_PUBLI>JORF n°0266 du 15 novembre 2026</ORIGINE_PUBLI></META_TEXTE_CHRONICLE><META_TEXTE_VERSION><TITRE>court</TITRE><TITREFULL>${titre}</TITREFULL><MINISTERE>Ministère de l'Europe et des affaires étrangères</MINISTERE></META_TEXTE_VERSION></META_SPEC></META></TEXTE_VERSION>`;
const T = titre => ({ titre, nor: 'XXXX2600000A' });

test('réglages : expressions régulières valides', () => {
  for (const l of [config.jo.mots_cles_forts, config.jo.exclusions, config.jo.accords_pertinents, config.bibliotheque.senat_mots_cles, config.bibliotheque.afe_exclusions, ...Object.values(config.themes)])
    for (const m of l) new RegExp(m);
  assert.match(config.jo.debut, /^\d{4}-\d{2}-\d{2}$/);
});

test('JO : pertinence sur des titres réels', () => {
  const P = (titre, nor = 'XXXX2600000A') => I.pertinenceJO({ titre, nor }, config);
  assert.equal(P("Arrêté du 10 novembre 2026 portant nomination au conseil d'administration de l'Agence pour l'enseignement français à l'étranger", 'EAEM2630173A'), 'moyenne');
  assert.equal(P("Arrêté du 5 novembre 2026 modifiant l'arrêté fixant le montant de l'indemnité servie aux personnels résidents des établissements d'enseignement français à l'étranger", 'EAEA2628517A'), 'forte');
  assert.equal(P("Décision du 12 novembre 2026 portant délégation de signature (direction des Français à l'étranger et de l'administration consulaire)", 'EAEF2629712S'), 'moyenne');
  assert.equal(P("Arrêté du 10 septembre 2026 établissant l'état des listes de candidats pour les élections sénatoriales du 27 septembre 2026", 'EAEF2600003A'), 'forte');   // direction des Français à l'étranger (NOR EAEF)
  assert.equal(P("Décision portant délégation de signature (direction du numérique)", 'EAEZ2600004S'), null);
  assert.equal(P("Arrêté modifiant l'arrêté relatif aux modalités d'organisation du vote électronique par internet des personnels", 'EAEA2600005A'), null);
  assert.equal(I.pertinenceJO({ titre: 'Remise de lettre de créance', nor: 'EAEP2600006X', nature: 'REMISE_LETTRE_CREANCE' }, config), null);
  assert.equal(P("Décret portant publication des résolutions adoptées par la Commission centrale pour la navigation du Rhin", 'EAEJ2600007D'), null);
  assert.equal(P("Décret relatif à l'élection des conseillers des Français de l'étranger"), 'forte');
  assert.equal(P("Arrêté portant titularisation dans le corps des secrétaires des affaires étrangères (agents diplomatiques et consulaires)", 'EAEA2629916A'), null);
  assert.equal(P("Arrêté du 16 novembre 2026 portant admission à la retraite (agents diplomatiques et consulaires)", 'EAEA2630099A'), null);
  assert.equal(P("Arrêté relatif au vote électronique par internet pour l'élection des représentants du personnel", 'TECK2626897A'), null);
  assert.equal(P("Décret portant publication de l'accord entre la France et Sainte-Lucie relatif aux services aériens", 'EAEJ2600001D'), null);
  assert.equal(P("Décret portant publication de la convention de sécurité sociale entre la France et le Chili", 'EAEJ2600002D'), 'moyenne');
  assert.equal(P("Arrêté fixant la liste des médecins autorisés à exercer", 'SFHN2627798A'), null);
});

test('JO : lecture XML, date de début, archive tar.gz', () => {
  const t = I.lireTexteJO(texte({ titre: "Décret relatif aux Français établis hors de France" }));
  assert.equal(t.id, 'JORFTEXT000055000001'); assert.equal(t.nature, 'ARRETE'); assert.equal(t.date_publication, '2026-11-15');
  assert.equal(I.texteRetenu(texte({ titre: 'Décret de 1969 relatif aux agents consulaires et aux Français de l\'étranger', date: '1969-03-13' }), config, '2026-09-01'), null);
  assert.equal(I.texteRetenu('<TEXTE_VERSION/>', config, '2026-09-01'), false);
  const gz = zlib.gzipSync(tar([
    ['20261121/jorf/global/texte/version/JORF/TEXT/a.xml', texte({ titre: "Arrêté relatif aux bourses scolaires au bénéfice des enfants français résidant à l'étranger" })],
    ['20261121/jorf/global/texte/version/JORF/TEXT/b.xml', texte({ id: 'JORFTEXT000055000002', nor: 'SFHN2600001A', titre: 'Arrêté relatif aux médecins' })],
    ['20261121/jorf/global/article/JORF/ARTI/c.xml', '<ARTICLE/>'],
  ]));
  const r = I.analyserFichierJO(gz, config, '2026-09-01');
  assert.equal(r.textes, 2); assert.equal(r.retenus.length, 1);
  assert.equal(r.retenus[0].pertinence, 'forte'); assert.equal(r.retenus[0].source, 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000055000001');
  assert.ok(r.retenus[0].themes.includes('Enseignement et jeunesse'));
  assert.throws(() => I.analyserFichierJO(zlib.gzipSync(tar([['x/texte/version/a.xml', '<A/>'], ['x/texte/version/b.xml', '<B/>']])), config, '2026-09-01'), /format inattendu/);
});

test('JO : lecture en flux de l’export complet (morceaux de taille quelconque)', async () => {
  const brut = tar([['g/texte/version/a.xml', texte({ titre: 'Décret relatif aux conseils consulaires' })], ['g/article/b.xml', 'x'.repeat(700)], ['g/texte/version/c.xml', texte({ id: 'JORFTEXT2', titre: 'Autre' })]]);
  const morceaux = []; for (let i = 0; i < brut.length; i += 333) morceaux.push(brut.subarray(i, i + 333));
  const vus = []; for await (const f of I.entreesTarEnFlux(Readable.from(morceaux))) vus.push(f.nom);
  assert.deepEqual(vus, ['g/texte/version/a.xml', 'g/texte/version/c.xml']);
});

test('JO : fichiers à lire (après le dernier lu, depuis la date de début)', () => {
  const html = '<a href="JORF_20261108-210452.tar.gz">x</a> JORF_20261109-212854.tar.gz JORF_20261110-002231.tar.gz JORF_20261109-212854.tar.gz';
  assert.deepEqual(I.fichiersJOaLire(html, null, '2026-11-09'), ['JORF_20261109-212854.tar.gz', 'JORF_20261110-002231.tar.gz']);
  assert.deepEqual(I.fichiersJOaLire(html, 'JORF_20261109-212854.tar.gz', '2026-09-01'), ['JORF_20261110-002231.tar.gz']);
});

test('fusion : doublons supprimés, date de première collecte conservée', () => {
  const r = I.fusionner([{ id: 'a', titre: 'ancien', collecte_le: '2026-11-01' }], [{ id: 'a', titre: 'corrigé' }, { id: 'b', titre: 'nouveau' }, { id: 'b', titre: 'nouveau bis' }], 'id', '2026-11-23');
  assert.equal(r.liste.length, 2);
  assert.deepEqual(r.liste.find(x => x.id === 'a'), { id: 'a', titre: 'corrigé', collecte_le: '2026-11-01' });
  assert.deepEqual(r.ajoutes.map(x => x.id), ['b']);
});

test('Sénat : flux RSS (ISO-8859-15), rapports pertinents seulement', () => {
  const xml = `<?xml version='1.0' encoding='iso-8859-15'?><rss><channel>
    <item><title>Budget 2027 : Action extérieure de l'État - avis n° 159</title><link>http://www.senat.fr/rap/a26-159-2/a26-159-2.html</link><pubDate>Mon,23 Nov 2026 18:40:14 GMT</pubDate><description>Avis n° 159 de M. X</description></item>
    <item><title>Agence pour l'enseignement français à l'étranger et emprunt - Texte n° 174</title><link>http://www.senat.fr/leg/ppl26-174.html</link><pubDate>Tue,17 Nov 2026 23:00:00 GMT</pubDate><description>Texte</description></item>
    <item><title>Budget 2027 : Cohésion des territoires - rapport spécial</title><link>http://www.senat.fr/rap/l26-156-35/x.html</link><pubDate>Mon,23 Nov 2026 18:00:00 GMT</pubDate><description>Rapport spécial</description></item>
  </channel></rss>`;
  const items = I.lireRSS(Buffer.from(xml, 'latin1'));
  assert.equal(items.length, 3); assert.equal(items[0].date, '2026-11-23'); assert.match(items[0].titre, /extérieure de l'État/);
  const d = I.documentsSenat(items, config);
  assert.equal(d.length, 1);                                   // la proposition de loi relève de « Activité législative »
  assert.equal(d[0].type, 'Avis budgétaire'); assert.equal(d[0].source, 'https://www.senat.fr/rap/a26-159-2/a26-159-2.html');
  assert.ok(d[0].themes.includes('Budget et finances publiques'));
});

test('AFE : type, session, commission, institution ; documents logistiques écartés', () => {
  const D = (t, f, ym = '2026/10') => I.documentAFE({ title: { rendered: t }, source_url: `https://www.assemblee-afe.fr/wp-content/uploads/${ym}/${f}` }, config);
  let d = D('261009 AFE 45eme ODJ prévisionnel public', '261009-AFE-45eme-ODJ-previsionnel-public.pdf');
  assert.equal(d.type, 'Ordre du jour'); assert.equal(d.session, '45e session'); assert.equal(d.date, '2026-10');
  d = D('RAPPORT FINAL COMM LOIS 44eAFE (002)', 'RAPPORT-FINAL-COMM-LOIS-44eAFE-002.pdf', '2026/05');
  assert.equal(d.type, 'Rapport'); assert.equal(d.session, '44e session'); assert.equal(d.commission, 'Commission des lois');
  d = D('Bourses scolaires et AESH (DFAE, AEFE) réponse de l&rsquo;AEFE', 'Bourses-scolaires-et-AESH-DFAE-AEFE-reponse-de-lAEFE.pdf', '2025/07');
  assert.equal(d.type, "Réponses de l'administration"); assert.match(d.titre, /l’AEFE/);
  assert.equal(D('fae_rapport_gouvernement_2026', 'fae_rapport_gouvernement_2026.pdf', '2026/08').institution, 'Gouvernement (MEAE)');
  assert.equal(D('44eAFE – PROCURATION', '44eAFE-PROCURATION.pdf'), null);
  assert.equal(D('Note logistique 44e AFE', 'Note-logistique-44e-AFE.pdf'), null);
  assert.equal(D('Tutoriel_inscription_diplomatica_élus', 'Tutoriel.pdf'), null);
});

test('AFE : doublons de fichiers (« -1 », « V2 », « _compressed ») regroupés', () => {
  assert.equal(I.cleFichier('https://x/2026/02/CASEAC-auditions-28.02.2026-1.pdf'), I.cleFichier('https://x/2026/02/CASEAC-auditions-28.02.2026.pdf'));
  assert.equal(I.cleFichier('https://x/43e-AFE-resolutions_compressed.pdf'), I.cleFichier('https://x/43e-AFE-resolutions.pdf'));
  assert.equal(I.cleFichier('https://x/37AFE-Rapport-commission-Lois-V2-1.pdf'), I.cleFichier('https://x/37AFE-Rapport-commission-Lois.pdf'));
  const d = I.dedoublonner([{ id: 'afe:x', date: '2026-02' }, { id: 'afe:x', date: '2026-03' }, { id: 'afe:y', date: '2026-01' }]);
  assert.deepEqual(d.map(x => x.date), ['2026-03', '2026-01']);
});

test('thèmes', () => {
  assert.deepEqual(I.classer("Accès au compte bancaire pour les Français établis hors de France", config), ['Droits et vie quotidienne']);
  assert.ok(I.classer("Budget 2027 : Action extérieure de l'État", config).includes('Budget et finances publiques'));
  assert.deepEqual(I.classer('Sans rapport', config), ['Autres']);
});

test('récapitulatif', () => {
  assert.equal(I.recapitulatif({ jo: { nouveautes: [] }, bibliotheque: { nouveautes: [] } }, '23/11/2026'), '');
  const r = I.recapitulatif({ jo: { nouveautes: [{ date_publication: '2026-11-15', titre: 'Décret', source: 'https://l' }] }, bibliotheque: { erreur: 'HTTP 500' } }, '23/11/2026');
  assert.match(r, /Journal officiel\*\* \(1\)/); assert.match(r, /15\/11\/2026 · Décret/); assert.match(r, /bibliotheque : HTTP 500/);
});

test('bibliothèque éditoriale : entrées complètes et sourcées', () => {
  const j = JSON.parse(fs.readFileSync(new URL('../data/institutionnel/bibliotheque-editoriale.json', import.meta.url)));
  const ids = new Set();
  for (const d of j.documents) {
    assert.ok(d.id && !ids.has(d.id), 'identifiant manquant ou en double : ' + d.id); ids.add(d.id);
    for (const k of ['titre', 'institution', 'type']) assert.ok(d[k], d.id + ' : champ « ' + k + ' » obligatoire');
    assert.match(d.date || '', /^\d{4}-\d{2}(-\d{2})?$/, d.id + ' : date AAAA-MM ou AAAA-MM-JJ');
    assert.match(d.source || '', /^https:\/\//, d.id + ' : source officielle obligatoire');
  }
});

await Promise.all(attente);
console.log(`Veille institutionnelle : ${ok} tests réussis.`);
