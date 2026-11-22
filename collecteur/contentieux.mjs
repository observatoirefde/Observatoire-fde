// Veille du contentieux électoral des Français de l'étranger (CFDE et conseillers AFE, 2026).
//
// Source : archives mensuelles open data des décisions du Conseil d'État
// (https://opendata.justice-administrative.fr/DCE/AAAA/MM/CE_AAAAMM.zip), seule
// source officielle, gratuite et téléchargeable sans aspiration de pages.
// Le Conseil d'État juge ces élections : une protestation déposée au tribunal
// administratif de Paris lui est transmise (exemple : CE, 4 novembre 2026, n° 516536).
//
// Fonctionnement (un passage par jour, workflow « Veille contentieux ») :
//  1. téléchargement de toutes les archives depuis mai 2026 (environ 2 Mo par mois) :
//     des décisions sont ajoutées après coup aux archives anciennes, il faut donc tout relire ;
//  2. contrôle du format (une archive illisible fait échouer la collecte sans rien publier) ;
//  3. détection : une même phrase doit citer le scrutin (CFDE, conseils consulaires, AFE…)
//     ET un terme électoral (élection, protestation, scrutin…) ;
//  4. rapprochement avec l'inventaire éditorial data/contentieux/recours.json
//     (numéros de dossier normalisés, recours joints, ECLI), décisions écartées
//     (data/contentieux/ecartees.json) exclues ;
//  5. écriture de data/contentieux/detections.json seulement si le contenu change
//     (ou au moins une fois par semaine, pour dater la dernière vérification) ;
//  6. récapitulatif des nouvelles décisions (fichier RECAP_FILE) publié par le workflow
//     en commentaire de l'issue « Veille contentieux ».
//
// Aucune donnée personnelle n'est ajoutée : les décisions open data sont déjà
// pseudonymisées ; seuls numéro, date, solution et un court extrait sont repris.
//
// Utilisation : node collecteur/contentieux.mjs [--archives dossier]   (dossier = archives déjà téléchargées, pour un test)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://opendata.justice-administrative.fr/DCE';
export const DEBUT = { annee: 2026, mois: 5 };          // premier mois analysé (élections de mai 2026)
const DOSSIER = path.join(ROOT, 'data/contentieux');
const SORTIE = path.join(DOSSIER, 'detections.json');
const BATTEMENT_JOURS = 7;                               // réécriture minimale pour dater la vérification

// ---------- Lecture d'une archive ZIP (sans dépendance) ----------
export function lireZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("archive ZIP illisible (fin de répertoire introuvable)");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const fichiers = [];
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('archive ZIP illisible (répertoire central)');
    const methode = buf.readUInt16LE(p + 10), taille = buf.readUInt32LE(p + 20);
    const lnom = buf.readUInt16LE(p + 28), lext = buf.readUInt16LE(p + 30), lcom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + lnom);
    p += 46 + lnom + lext + lcom;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('archive ZIP illisible (en-tête local)');
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + taille);
    if (nom.endsWith('/')) continue;
    const contenu = methode === 0 ? brut : methode === 8 ? zlib.inflateRawSync(brut) : null;
    if (!contenu) throw new Error(`méthode de compression non prise en charge (${methode}) pour ${nom}`);
    fichiers.push({ nom, contenu });
  }
  return fichiers;
}

// ---------- Lecture d'une décision (XML open data) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const balise = (xml, nom) => { const m = xml.match(new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`)); return m ? decode(m[1]).trim() : ''; };

export function lireDecision(xml) {
  const texte = decode(xml.match(/<Texte_Integral>([\s\S]*?)<\/Texte_Integral>/)?.[1] || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim();
  return {
    numero: balise(xml, 'Numero_Dossier'), date: balise(xml, 'Date_Lecture'), ecli: balise(xml, 'Numero_ECLI'),
    type: balise(xml, 'Type_Decision'), solution: balise(xml, 'Solution'), formation: balise(xml, 'Formation_Jugement'),
    juridiction: balise(xml, 'Code_Juridiction'), texte,
  };
}

// ---------- Normalisation ----------
export const norm = s => String(s || '').toLowerCase().replace(/[’ʼ`]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim();
// numéros de dossier : « 516536 », « n° 516 536 », « 516536, 516540 », « sous le n° 516540 »
export function numeros(numeroDossier, texte = '') {
  const out = new Set();
  const ajoute = s => (String(s).match(/\d[\d\s]{3,8}\d/g) || []).forEach(x => { const n = x.replace(/\s/g, ''); if (n.length >= 5 && n.length <= 7) out.add(n); });
  ajoute(numeroDossier);
  for (const m of norm(texte).matchAll(/sous les? n(?:°|o|os)s? ?([\d ,et]{5,60})/g)) ajoute(m[1]);
  return [...out];
}

// ---------- Détection ----------
const T_CFDE = /conseill(?:er|ers|ere|eres) des francais de l'etranger|conseils? consulaires?|delegues? consulaires?|conseill(?:er|ers|ere|eres) consulaires?/;
const T_AFE = /assemblee des francais de l'etranger|conseill(?:er|ers|ere|eres) a l'assemblee des francais|\bafe\b/;
const T_ELEC = /\belections?\b|\belector(?:al|ale|ales|aux)\b|\bprotestations?\b|\bscrutins?\b|\bproclamation\b|\blistes? (?:candidates?|conduites?)\b/;
const T_SENAT = /\bsenat(?:eur|eurs|rice|rices|oriales?)?\b/;

// noms de circonscription : tokens significatifs (sans « 1re circonscription », « avec … », mots outils)
const OUTILS = new Set(['et', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'avec', 'etat', 'republique']);
const tokens = s => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1 && !OUTILS.has(t));
export function indexCirconscriptions(noms) {
  return [...new Set(noms)].map(nom => ({ nom, t: tokens(nom.replace(/\(.*?\)/g, '').replace(/ - \d+(?:re|e) circonscription/i, '')) }))
    .filter(c => c.t.length);
}
function circonscriptions(texteNorm, index) {
  const mots = new Set(tokens(texteNorm));
  const noms = index.filter(c => c.t.every(t => mots.has(t))).map(c => c.nom);
  // plusieurs circonscriptions d'un même pays (« Etats-Unis - 1re … 5e ») : le pays seul, à préciser
  const pays = n => n.replace(/ - \d+(?:re|e) circonscription.*$/i, '');
  const compte = {}; noms.forEach(n => compte[pays(n)] = (compte[pays(n)] || 0) + 1);
  return [...new Set(noms.map(n => compte[pays(n)] > 1 ? pays(n) + ' (circonscription à préciser)' : n))];
}

export function analyser(d, ctx) {
  const tn = norm(d.texte);
  const nums = numeros(d.numero, d.texte);
  const connu = nums.find(n => ctx.connus.has(n)) || (d.ecli && ctx.eclis.has(d.ecli) ? ctx.eclis.get(d.ecli) : null);
  const phrases = tn.split(/(?<=[.;:!?])\s+|\n+/);
  const touche = phrases.filter(p => (T_CFDE.test(p) || T_AFE.test(p)) && T_ELEC.test(p));
  if (!connu && !touche.length) return null;
  const ref = touche[0] || '';
  const cfde = touche.some(p => T_CFDE.test(p)), afe = touche.some(p => T_AFE.test(p));
  const senat = touche.length > 0 && touche.every(p => T_SENAT.test(p));
  let score = touche.length ? 3 : 0;
  if (/\b2026\b/.test(tn)) score++;
  if (/\bprotestation/.test(tn)) score++;
  const circ = circonscriptions(touche.join(' '), ctx.circ);
  if (circ.length) score++;
  // extrait : phrase d'origine (accents conservés), tronquée
  const brut = d.texte.split(/(?<=[.;:!?])\s+|\n+/).find(p => ref && norm(p) === ref) || '';
  return {
    numero: d.numero, numeros: nums, date: d.date, type: d.type, solution: d.solution, formation: d.formation, ecli: d.ecli,
    scrutin: senat ? 'Hors périmètre probable (sénatoriales)' : cfde && afe ? 'CFDE ou AFE' : afe ? 'AFE' : cfde ? 'CFDE' : 'À déterminer',
    circonscriptions: circ.slice(0, 5), score, extrait: brut.length > 320 ? brut.slice(0, 317) + '…' : brut,
    recours: connu ? ctx.recoursPar.get(connu) || null : null,
    source: `https://www.conseil-etat.fr/fr/arianeweb/CE/decision/${d.date}/${d.numero}`,
  };
}

// contrôle de format d'une archive : un format inattendu ne doit jamais produire « aucune décision »
export function analyserArchive(fichiers, ctx, label) {
  const xml = fichiers.filter(f => f.nom.toLowerCase().endsWith('.xml'));
  if (!xml.length) throw new Error(`${label} : aucune décision XML dans l'archive`);
  let lisibles = 0; const hits = [];
  for (const f of xml) {
    const d = lireDecision(f.contenu.toString('utf8'));
    if (!d.numero || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    lisibles++;
    const h = analyser(d, ctx);
    if (h) hits.push(Object.assign(h, { archive: label }));
  }
  if (lisibles / xml.length < 0.9) throw new Error(`${label} : format inattendu (${lisibles} décisions lisibles sur ${xml.length})`);
  return { fichiers: xml.length, hits };
}

// ---------- Contexte éditorial ----------
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return defaut; throw new Error(`${path.relative(ROOT, f)} : JSON invalide (${e.message})`); } };
export function contexte(recours, ecartees, nomsCirc) {
  const connus = new Set(), eclis = new Map(), recoursPar = new Map();
  for (const r of recours.recours || []) {
    for (const n of r.numeros_ce || []) { const k = String(n).replace(/\D/g, ''); if (k) { connus.add(k); recoursPar.set(k, r.id); } }
    for (const e of r.ecli || []) { eclis.set(e, r.id); recoursPar.set(r.id, r.id); }
  }
  const exclus = new Set((ecartees.ecartees || []).map(e => String(e.numero).replace(/\D/g, '')));
  return { connus, eclis, recoursPar, exclus, circ: indexCirconscriptions(nomsCirc) };
}

export function moisAAnalyser(aujourdhui = new Date()) {
  const out = []; let a = DEBUT.annee, m = DEBUT.mois;
  while (a < aujourdhui.getUTCFullYear() || (a === aujourdhui.getUTCFullYear() && m <= aujourdhui.getUTCMonth() + 1)) {
    out.push(`${a}${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; a++; }
  }
  return out;
}

// assemble le résultat ; « essentiel » sert à décider s'il faut réécrire le fichier
export function resultat(archives, hits, avertissements, ctx, precedent, maintenant) {
  const parCle = new Map();
  for (const h of hits) { const k = h.numero + '|' + h.date; if (!parCle.has(k)) parCle.set(k, h); }   // doublons entre archives
  const vus = new Map((precedent?.decisions || []).map(d => [d.numero + '|' + d.date, d.premiere_detection]));
  const decisions = [...parCle.values()]
    .filter(h => !h.numeros.some(n => ctx.exclus.has(n)))
    .map(h => Object.assign(h, { premiere_detection: vus.get(h.numero + '|' + h.date) || maintenant.slice(0, 10) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));
  const nouvelles = decisions.filter(d => !vus.has(d.numero + '|' + d.date));
  const essentiel = { archives, avertissements, decisions };
  return { essentiel, nouvelles, ecartees_masquees: [...parCle.values()].length - decisions.length };
}

export function recapitulatif(nouvelles, date) {
  if (!nouvelles.length) return '';
  const l = [`### Contentieux électoral : ${nouvelles.length} décision${nouvelles.length > 1 ? 's' : ''} à examiner (${date})`, ''];
  for (const d of nouvelles) {
    l.push(`- **n° ${d.numero}** du ${d.date.split('-').reverse().join('/')} · ${d.type || 'décision'} · ${d.solution || 'solution non précisée'} · ${d.scrutin}` +
      (d.circonscriptions.length ? ` · ${d.circonscriptions.join(', ')}` : '') + (d.recours ? ` · rapprochée du recours \`${d.recours}\`` : ' · **à vérifier**'));
    if (d.extrait) l.push(`  > ${d.extrait}`);
    l.push(`  ${d.source}`);
  }
  l.push('', nouvelles.some(d => !d.recours)
    ? "À faire : examiner chaque décision « à vérifier », puis l'ajouter à `data/contentieux/recours.json` (recours confirmé) ou à `data/contentieux/ecartees.json` (hors sujet)."
    : "À faire : vérifier que la décision correspond bien au recours indiqué et mettre à jour son statut dans `data/contentieux/recours.json` si besoin.");
  return l.join('\n') + '\n';
}

// ---------- Programme principal ----------
async function telecharger(label) {
  const url = `${BASE}/${label.slice(0, 4)}/${label.slice(4)}/CE_${label}.zip`;
  let derniere;
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'observatoire-fde-veille-contentieux' }, signal: AbortSignal.timeout(90000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { derniere = e; await new Promise(res => setTimeout(res, essai * 5000)); }
  }
  throw new Error(`${url} : ${derniere.message}`);
}

async function main() {
  const i = process.argv.indexOf('--archives'), local = i > 0 ? process.argv[i + 1] : null;
  const recours = lireJson(path.join(DOSSIER, 'recours.json'), { recours: [] });
  const ecartees = lireJson(path.join(DOSSIER, 'ecartees.json'), { ecartees: [] });
  const noms = lireJson(path.join(ROOT, 'data/consulaires-2026.json'), []).map(c => c.name)
    .concat((lireJson(path.join(ROOT, 'data/cafe-2026.json'), {}).circonscriptions) || []);
  const ctx = contexte(recours, ecartees, noms);
  const precedent = lireJson(SORTIE, null);
  const mois = moisAAnalyser(), archives = {}, avertissements = [], hits = [];
  for (const label of mois) {
    const buf = local ? (fs.existsSync(path.join(local, `CE_${label}.zip`)) ? fs.readFileSync(path.join(local, `CE_${label}.zip`)) : null) : await telecharger(label);
    if (!buf) {
      const recent = label >= mois[Math.max(0, mois.length - 2)];
      avertissements.push(recent ? `Archive ${label} pas encore publiée.` : `Archive ${label} introuvable (404).`);
      archives[label] = null; continue;
    }
    const r = analyserArchive(lireZip(buf), ctx, label);
    archives[label] = r.fichiers; hits.push(...r.hits);
  }
  if (!Object.values(archives).some(Boolean)) throw new Error('aucune archive lue : collecte interrompue, données publiées inchangées');
  const maintenant = new Date().toISOString();
  const { essentiel, nouvelles, ecartees_masquees } = resultat(archives, hits, avertissements, ctx, precedent, maintenant);
  const change = !precedent || JSON.stringify({ archives: precedent.archives, avertissements: precedent.avertissements, decisions: precedent.decisions }) !== JSON.stringify(essentiel);
  const vieux = !precedent?.derniere_verification || (Date.parse(maintenant) - Date.parse(precedent.derniere_verification)) > BATTEMENT_JOURS * 864e5;
  if (change || vieux) {
    const sortie = {
      note: "Fichier produit automatiquement par collecteur/contentieux.mjs (workflow « Veille contentieux »). Ne pas modifier à la main : les décisions confirmées vont dans recours.json, les décisions hors sujet dans ecartees.json.",
      source: `${BASE}/`, derniere_verification: maintenant, ecartees_masquees, ...essentiel,
    };
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(SORTIE + '.tmp', JSON.stringify(sortie, null, 1) + '\n');
    fs.renameSync(SORTIE + '.tmp', SORTIE);
  }
  if (process.env.RECAP_FILE) fs.writeFileSync(process.env.RECAP_FILE, recapitulatif(nouvelles, maintenant.slice(0, 10)));
  const total = Object.values(archives).reduce((a, n) => a + (n || 0), 0);
  console.log(`${total} décisions lues dans ${Object.values(archives).filter(Boolean).length} archives ; ${essentiel.decisions.length} décisions retenues (${nouvelles.length} nouvelles, ${ecartees_masquees} écartées) ; fichier ${change ? 'mis à jour' : vieux ? 'redaté' : 'inchangé'}.`);
  avertissements.forEach(a => console.log('Avertissement : ' + a));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('Échec de la collecte : ' + e.message); process.exit(1); });
}
