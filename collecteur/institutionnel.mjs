// Veille institutionnelle (rubrique « Veille » → sous-onglet « Veille institutionnelle »).
// Étape 1 : Journal officiel et bibliothèque documentaire. Node 20, sans dépendance.
//
// Modules, chacun isolé (une source en panne n'empêche pas l'actualisation des autres ;
// ses données précédentes restent publiées et l'erreur est notée dans etat.json) :
//  • jo           : données ouvertes du Journal officiel (DILA, https://echanges.dila.gouv.fr/OPENDATA/JORF/),
//                   fichiers quotidiens .tar.gz ; seuls les fichiers nouveaux sont lus (data/institutionnel/jo.json → dernier_fichier).
//  • bibliotheque : rapports du Sénat (flux RSS officiels) et documents publiés par l'AFE
//                   (API publique WordPress d'assemblee-afe.fr, en respectant le délai de 10 s demandé par le site),
//                   complétés par les entrées éditoriales de data/institutionnel/bibliotheque-editoriale.json.
// Réglages (mots-clés, thèmes, exclusions) : data/institutionnel/config.json.
//
// Utilisation : node collecteur/institutionnel.mjs [jo] [bibliotheque]   (sans argument : tous les modules)
// Variables : RECAP_FILE (récapitulatif des nouveautés pour l'issue « Veille institutionnelle »).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(ROOT, 'data/institutionnel');
const UA = { 'User-Agent': 'observatoire-fde-veille-institutionnelle' };

// ---------- Utilitaires ----------
export const norm = s => String(s || '').toLowerCase().replace(/[’ʼ`]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ugrave: 'ù', ucirc: 'û', Eacute: 'É', oelig: 'œ', deg: '°', euro: '€' };
export const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const balise = (xml, nom) => { const m = xml.match(new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`)); return m ? decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : ''; };
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return defaut; throw new Error(`${path.relative(ROOT, f)} : JSON invalide (${e.message})`); } };
const ecrireJson = (f, obj) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 1) + '\n'); fs.renameSync(f + '.tmp', f); };
const pause = ms => new Promise(r => setTimeout(r, ms));

async function telecharger(url, { essais = 3, delai = 90000 } = {}) {
  let derniere;
  for (let i = 1; i <= essais; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(delai) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { derniere = e; if (i < essais) await pause(i * 5000); }
  }
  throw new Error(`${url} : ${derniere.message}`);
}

// ---------- Thèmes et pertinence ----------
export function classer(titre, config) {
  const t = norm(titre);
  const themes = Object.entries(config.themes).filter(([, motifs]) => motifs.some(m => new RegExp(m).test(t))).map(([nom]) => nom);
  return themes.length ? themes : ['Autres'];
}
const motif = liste => new RegExp(liste.join('|'));

// ---------- Archives .tar.gz (format ustar) ----------
export function lireTar(buf) {
  const fichiers = []; let p = 0;
  while (p + 512 <= buf.length) {
    const entete = buf.subarray(p, p + 512);
    if (entete.every(o => o === 0)) break;
    const champ = (a, b) => entete.toString('utf8', a, b).replace(/\0.*$/s, '');
    let nom = champ(0, 100); const prefixe = champ(345, 500); if (prefixe) nom = prefixe + '/' + nom;
    const taille = parseInt(champ(124, 136).trim() || '0', 8), type = String.fromCharCode(entete[156] || 48);
    p += 512;
    if (type === '0' || type === '\0') fichiers.push({ nom, contenu: buf.subarray(p, p + taille) });
    p += Math.ceil(taille / 512) * 512;
  }
  return fichiers;
}

// ---------- Module 1 : Journal officiel ----------
export function lireTexteJO(xml) {
  return {
    id: balise(xml, 'CID') || balise(xml, 'ID'), nature: balise(xml, 'NATURE'), nor: balise(xml, 'NOR'),
    date_publication: balise(xml, 'DATE_PUBLI'), date_texte: balise(xml, 'DATE_TEXTE'),
    titre: balise(xml, 'TITREFULL') || balise(xml, 'TITRE'), ministere: balise(xml, 'MINISTERE'),
    publication: balise(xml, 'ORIGINE_PUBLI'), origine: balise(xml, 'ORIGINE'),
  };
}

// pertinence : « forte » (le titre vise les Français de l'étranger, ou texte de la direction des Français à l'étranger),
// « moyenne » (autre texte du MEAE d'intérêt général, accord international utile aux Français de l'étranger) ; null = écarté
export function pertinenceJO(t, config) {
  const c = config.jo, titre = norm(t.titre), nor = t.nor || '';
  if ((c.natures_exclues || []).some(n => new RegExp(n).test(t.nature || ''))) return null;
  const fort = motif(c.mots_cles_forts), exclu = motif(c.exclusions);
  const dfae = (c.prefixes_nor_dfae || []).some(p => nor.startsWith(p)), meae = c.prefixes_nor_meae.some(p => nor.startsWith(p));
  const accord = /(portant publication|autorisant (l'approbation|la ratification|l'adhesion))/.test(titre);
  if (accord) return motif(c.accords_pertinents).test(titre) || fort.test(titre) ? 'moyenne' : null;
  if (fort.test(titre) || dfae) return exclu.test(titre) ? 'moyenne' : 'forte';
  if (meae && !exclu.test(titre)) return 'moyenne';
  return null;
}

// un texte (XML « texte/version ») : objet retenu, null (hors sujet ou ancien) ou false (illisible)
export function texteRetenu(xml, config, debut) {
  const t = lireTexteJO(xml);
  if (!t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date_publication)) return false;
  if (t.origine && t.origine !== 'JORF') return null;
  if (t.date_publication < debut) return null;             // anciens textes republiés dans les fichiers du jour
  const p = pertinenceJO(t, config);
  if (!p) return null;
  return { id: t.id, nature: t.nature, nor: t.nor, date_publication: t.date_publication, date_texte: t.date_texte,
    titre: t.titre, ministere: t.ministere, publication: t.publication, pertinence: p, themes: classer(t.titre, config),
    source: `https://www.legifrance.gouv.fr/jorf/id/${t.id}` };
}

export function analyserFichierJO(buf, config, debut) {
  const tar = lireTar(zlib.gunzipSync(buf));
  const versions = tar.filter(f => f.nom.includes('/texte/version/') && f.nom.endsWith('.xml'));
  const retenus = [];
  let lisibles = 0;
  for (const f of versions) {
    const r = texteRetenu(f.contenu.toString('utf8'), config, debut);
    if (r !== false) lisibles++;
    if (r) retenus.push(r);
  }
  if (versions.length && lisibles / versions.length < 0.9) throw new Error(`format inattendu (${lisibles} textes lisibles sur ${versions.length})`);
  return { textes: versions.length, retenus };
}

// Reprise unique : l'export complet (« Freemium_jorf_global_… », environ 1,6 Go) est lu au fil du téléchargement,
// sans être stocké, pour retrouver les textes publiés depuis la date de début ; seuls les « texte/version » sont analysés.
export async function* entreesTarEnFlux(flux) {
  let tampon = Buffer.alloc(0), attente = null;           // attente : { nom, taille, reste, morceaux, garder }
  for await (const morceau of flux) {
    tampon = tampon.length ? Buffer.concat([tampon, morceau]) : morceau;
    let p = 0;
    for (;;) {
      if (attente) {
        const n = Math.min(attente.reste, tampon.length - p);
        if (attente.garder) attente.morceaux.push(tampon.subarray(p, p + n));
        attente.reste -= n; p += n;
        if (attente.reste > 0) break;
        if (attente.garder) yield { nom: attente.nom, contenu: Buffer.concat(attente.morceaux).subarray(0, attente.taille) };
        attente = null;
      }
      if (tampon.length - p < 512) break;
      const entete = tampon.subarray(p, p + 512); p += 512;
      if (entete.every(o => o === 0)) continue;
      const champ = (a, b) => entete.toString('utf8', a, b).replace(/\0.*$/s, '');
      let nom = champ(0, 100); const prefixe = champ(345, 500); if (prefixe) nom = prefixe + '/' + nom;
      const taille = parseInt(champ(124, 136).trim() || '0', 8), type = String.fromCharCode(entete[156] || 48);
      const garder = (type === '0' || type === '\0') && nom.includes('/texte/version/') && nom.endsWith('.xml');
      attente = { nom, taille, reste: Math.ceil(taille / 512) * 512, morceaux: [], garder };
    }
    tampon = tampon.subarray(p);
  }
}

async function repriseJO(url, config) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  const { Readable } = await import('node:stream');
  const flux = Readable.fromWeb(r.body).pipe(zlib.createGunzip());
  const retenus = []; let lus = 0, lisibles = 0;
  for await (const f of entreesTarEnFlux(flux)) {
    lus++;
    const t = texteRetenu(f.contenu.toString('utf8'), config, config.jo.debut);
    if (t !== false) lisibles++;
    if (t) retenus.push(t);
  }
  if (!lus || lisibles / lus < 0.9) throw new Error(`export complet : format inattendu (${lisibles} textes lisibles sur ${lus})`);
  return { lus, retenus };
}

export function fichiersJOaLire(listeHtml, dernier, debut) {
  const noms = [...new Set(listeHtml.match(/JORF_\d{8}-\d{6}\.tar\.gz/g) || [])].sort();
  const min = 'JORF_' + debut.replace(/-/g, '');
  return noms.filter(n => n > (dernier || '') && n >= min);
}

// fusion avec l'existant : dédoublonnage par identifiant JORF (la version la plus récente l'emporte)
export function fusionner(anciens, nouveaux, cle, aujourdhui) {
  const par = new Map(anciens.map(x => [x[cle], x]));
  const ajoutes = [];
  for (const n of nouveaux) {
    const a = par.get(n[cle]);
    if (!a) ajoutes.push(n);
    par.set(n[cle], Object.assign({}, n, { collecte_le: a?.collecte_le || aujourdhui }));
  }
  return { liste: [...par.values()], ajoutes };
}

async function moduleJO(config, aujourdhui) {
  const f = path.join(DOSSIER, 'jo.json');
  const prec = lireJson(f, { textes: [] });
  const base = config.jo.source;
  const liste = (await telecharger(base)).toString('utf8');
  if (!/JORF_\d{8}/.test(liste)) throw new Error('liste des fichiers du Journal officiel illisible');
  let retenus = [], textes = 0, dernier = prec.dernier_fichier || null, reprise = prec.reprise || null;
  // première exécution : si les fichiers quotidiens disponibles commencent après la date de début, reprise par l'export complet
  const premier = ([...new Set(liste.match(/JORF_\d{8}-\d{6}\.tar\.gz/g) || [])].sort()[0] || '').slice(5, 13);
  const global = (liste.match(/Freemium_jorf_global_\d{8}-\d{6}\.tar\.gz/g) || []).sort().pop();
  if (!reprise && premier && config.jo.debut.replace(/-/g, '') < premier) {
    if (!global) throw new Error("export complet introuvable : reprise de l'historique impossible");
    const r = await repriseJO(base + global, config);
    retenus.push(...r.retenus); textes += r.lus;
    reprise = { fichier: global, date: aujourdhui, textes_lus: r.lus, retenus: r.retenus.length };
  }
  const aLire = fichiersJOaLire(liste, prec.dernier_fichier, config.jo.debut);
  for (const nom of aLire) {
    const r = analyserFichierJO(await telecharger(base + nom), config, config.jo.debut);
    retenus.push(...r.retenus); textes += r.textes; dernier = nom;
  }
  const fus = fusionner(prec.textes || [], retenus, 'id', aujourdhui);
  // les réglages s'appliquent aussi aux textes déjà collectés (pertinence et thèmes recalculés)
  const tous = fus.liste.map(t => Object.assign(t, { pertinence: pertinenceJO(t, config), themes: classer(t.titre, config) })).filter(t => t.pertinence);
  const ajoutes = fus.ajoutes.filter(t => tous.includes(t));
  tous.sort((a, b) => b.date_publication.localeCompare(a.date_publication) || a.titre.localeCompare(b.titre, 'fr'));
  ecrireJson(f, {
    note: 'Produit par collecteur/institutionnel.mjs (workflow « Veille institutionnelle »). Ne pas modifier à la main : réglages dans config.json.',
    source: base, debut: config.jo.debut, reprise, dernier_fichier: dernier, derniere_verification: aujourdhui, textes: tous,
  });
  return { resume: `${aLire.length} fichier(s) lu(s), ${textes} textes examinés, ${retenus.length} retenus, ${ajoutes.length} nouveaux`, nouveautes: ajoutes.filter(t => t.pertinence === 'forte'), total: tous.length };
}

// ---------- Module 4 : Bibliothèque documentaire ----------
export function lireRSS(buf) {
  const enc = (buf.subarray(0, 200).toString('latin1').match(/encoding=["']([^"']+)["']/i) || [])[1] || 'utf-8';
  const xml = new TextDecoder(enc.toLowerCase()).decode(buf);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
    titre: balise(m[1], 'title'), lien: balise(m[1], 'link').replace(/^http:/, 'https:'),
    date: (() => { const d = new Date(balise(m[1], 'pubDate').replace(/^(\w+),(\d)/, '$1, $2')); return isNaN(d) ? '' : d.toISOString().slice(0, 10); })(),
    description: balise(m[1], 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

export function documentsSenat(items, config) {
  const fort = motif(config.bibliotheque.senat_mots_cles);
  return items.filter(i => /\/(rap|notice-rapport)\//.test(i.lien) && fort.test(norm(i.titre + ' ' + i.description)))
    .map(i => ({ id: 'senat:' + i.lien.replace(/^https?:\/\/www\.senat\.fr/, ''), titre: i.titre, institution: 'Sénat',
      type: /^avis/i.test(i.description) || / - avis n/i.test(i.titre) ? 'Avis budgétaire' : /rapport sp[ée]cial/i.test(i.titre + i.description) ? 'Rapport spécial (budget)' : /information/i.test(i.titre + i.description) ? "Rapport d'information" : 'Rapport',
      date: i.date, annee: i.date.slice(0, 4), themes: classer(i.titre + ' ' + i.description, config), resume: i.description.slice(0, 300), source: i.lien, origine: 'Flux RSS du Sénat' }));
}

// documents PDF publiés par l'AFE : nom de fichier normalisé pour écarter les doublons (« -1 », « V2 », « _compressed »)
export const cleFichier = url => norm(decodeURIComponent(url.split('/').pop()).replace(/\.pdf$/i, ''))
  .replace(/^pdf[ -_]+/, '').replace(/(_compressed|[-_ ]v ?\d+|[-_ ]?vf|[-_ ]\d)+$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const COMMISSIONS = [[/\blois\b/, 'Commission des lois'], [/\bfin\b|financ/, 'Commission des finances'], [/\bens\b|enseignement/, "Commission de l'enseignement"],
  [/\bsecu\b|securite/, 'Commission de la sécurité'], [/caseac|affaires sociales/, 'Commission des affaires sociales'], [/ddce|dd ce|commerce exterieur/, 'Commission du commerce extérieur']];
export function documentAFE(m, config) {
  const titre = decode(m.title?.rendered || '').replace(/\s+/g, ' ').trim(), url = m.source_url || '';
  const t = norm(titre + ' ' + url.split('/').pop());
  if (motif(config.bibliotheque.afe_exclusions).test(t)) return null;
  const type = /rapport.{0,3}gouvernement|rapport du gouvernement/.test(t) ? 'Rapport du Gouvernement'
    : /resolution/.test(t) ? 'Résolutions' : /reponse|role des qo/.test(t) ? "Réponses de l'administration"
    : /\bodj\b|ordre du jour/.test(t) ? 'Ordre du jour' : /audition/.test(t) ? 'Auditions'
    : /verbatim|\bcr\b|compte rendu|\brs meae\b/.test(t) ? 'Compte rendu' : /rapport|bilan|feuille de route|etude|synthese/.test(t) ? 'Rapport' : null;
  if (!type) return null;
  const institution = /^aefe|aefe_/.test(t) ? 'AEFE' : /^cfe\b/.test(t) ? 'CFE' : /rapport.{0,3}gouvernement|^meae|^rs meae/.test(t) ? 'Gouvernement (MEAE)' : 'AFE';
  const session = (t.match(/\b(\d{2}) ?(?:e|eme)? ?(?:session )?afe|\bafe ?(\d{2})(?:e|eme)?\b|\b(\d{2}) ?(?:e|eme) session/) || []).slice(1).find(Boolean);
  const commission = (COMMISSIONS.find(([re]) => re.test(t)) || [])[1] || null;
  const ym = (url.match(/\/uploads\/(\d{4})\/(\d{2})\//) || []);
  const date = ym[1] ? `${ym[1]}-${ym[2]}` : (m.date || '').slice(0, 7);
  return { id: 'afe:' + cleFichier(url), titre, institution, type, session: session ? `${session}e session` : null, commission,
    date, annee: date.slice(0, 4), themes: classer(titre, config), source: url, origine: "Site de l'AFE (API publique)" };
}

export function dedoublonner(docs) {
  const par = new Map();
  for (const d of docs) { const a = par.get(d.id); if (!a || (d.date || '') > (a.date || '')) par.set(d.id, d); }
  return [...par.values()];
}

async function moduleBibliotheque(config, aujourdhui) {
  const f = path.join(DOSSIER, 'bibliotheque.json');
  const prec = lireJson(f, { documents: [] });
  const erreurs = [], docs = [];
  // Sénat : les flux ne contiennent que les publications récentes ; l'historique s'accumule d'un passage à l'autre
  for (const url of config.bibliotheque.senat_flux) {
    try { docs.push(...documentsSenat(lireRSS(await telecharger(url)), config)); }
    catch (e) { erreurs.push(`Sénat : ${e.message}`); }
  }
  // AFE : documents PDF via l'API publique (10 s entre deux requêtes, comme demandé par le site)
  try {
    for (let page = 1; page <= 10; page++) {
      if (page > 1) await pause(10000);
      const url = `${config.bibliotheque.afe_api}?mime_type=application/pdf&per_page=100&page=${page}&_fields=id,date,title,source_url`;
      let r;
      for (let essai = 1; ; essai++) {
        try { r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }); if (r.ok || r.status === 400 || essai >= 3) break; }
        catch (e) { if (essai >= 3) throw e; }
        await pause(15000);                                    // nouvel essai, en respectant le délai demandé par le site
      }
      if (r.status === 400 && page > 1) break;                 // au-delà de la dernière page
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const lot = await r.json();
      if (!Array.isArray(lot)) throw new Error('réponse inattendue');
      lot.forEach(m => { const d = documentAFE(m, config); if (d) docs.push(d); });
      if (page >= +(r.headers.get('x-wp-totalpages') || 1)) break;
    }
  } catch (e) { erreurs.push(`AFE : ${e.message}`); }
  if (!docs.length && erreurs.length) throw new Error(erreurs.join(' ; '));
  // entrées éditoriales (vérifiées à la main) : prioritaires
  const edito = (lireJson(path.join(DOSSIER, 'bibliotheque-editoriale.json'), { documents: [] }).documents || [])
    .map(d => Object.assign({ origine: 'Sélection éditoriale', themes: classer(d.titre, config), annee: (d.date || '').slice(0, 4) }, d));
  const automatiques = dedoublonner(docs);
  const { liste, ajoutes } = fusionner(prec.documents || [], automatiques.concat(edito), 'id', aujourdhui);
  liste.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.titre.localeCompare(b.titre, 'fr'));
  ecrireJson(f, { note: 'Produit par collecteur/institutionnel.mjs. Entrées manuelles : bibliotheque-editoriale.json.', derniere_verification: aujourdhui, avertissements: erreurs, documents: liste });
  return { resume: `${liste.length} documents (${ajoutes.length} nouveaux)${erreurs.length ? ' ; ' + erreurs.join(' ; ') : ''}`, nouveautes: ajoutes, total: liste.length };
}

// ---------- Récapitulatif ----------
export function recapitulatif(res, date) {
  const l = [];
  const jo = res.jo?.nouveautes || [], bib = res.bibliotheque?.nouveautes || [];
  if (jo.length) { l.push(`**Journal officiel** (${jo.length})`); jo.slice(0, 30).forEach(t => l.push(`- ${t.date_publication.split('-').reverse().join('/')} · ${t.titre} · ${t.source}`)); l.push(''); }
  if (bib.length) { l.push(`**Bibliothèque** (${bib.length})`); bib.slice(0, 30).forEach(d => l.push(`- ${d.institution} · ${d.titre} · ${d.source}`)); l.push(''); }
  const err = Object.entries(res).filter(([, r]) => r.erreur);
  if (err.length) { l.push('**Erreurs** (données précédentes conservées)'); err.forEach(([m, r]) => l.push(`- ${m} : ${r.erreur}`)); }
  return l.length ? `### Veille institutionnelle du ${date}\n\n${l.join('\n')}\n` : '';
}

// ---------- Programme principal ----------
const MODULES = { jo: moduleJO, bibliotheque: moduleBibliotheque };
async function main() {
  const config = lireJson(path.join(DOSSIER, 'config.json'), null);
  if (!config) throw new Error('data/institutionnel/config.json introuvable');
  const demandes = process.argv.slice(2).filter(a => MODULES[a]);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const fEtat = path.join(DOSSIER, 'etat.json'), etat = lireJson(fEtat, { modules: {} });
  const res = {};
  for (const nom of (demandes.length ? demandes : Object.keys(MODULES))) {
    try {
      const r = await MODULES[nom](config, aujourdhui);
      res[nom] = r; etat.modules[nom] = { derniere_verification: aujourdhui, statut: 'ok', resume: r.resume, total: r.total };
      console.log(`${nom} : ${r.resume}`);
    } catch (e) {
      res[nom] = { erreur: e.message };
      etat.modules[nom] = Object.assign({}, etat.modules[nom], { statut: 'erreur', erreur: e.message, derniere_tentative: aujourdhui });
      console.error(`${nom} : échec (${e.message}) ; données précédentes conservées`);
    }
  }
  etat.derniere_execution = aujourdhui;
  ecrireJson(fEtat, etat);
  if (process.env.RECAP_FILE) fs.writeFileSync(process.env.RECAP_FILE, recapitulatif(res, aujourdhui.split('-').reverse().join('/')));
  if (Object.values(res).every(r => r.erreur)) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('Échec : ' + e.message); process.exit(1); });
}
