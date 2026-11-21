#!/usr/bin/env node
// =====================================================================
// Collecteur automatique Bluesky de la Veille parlementaire.
//
// Source de référence : la liste Bluesky indiquée dans data/veille/config.json.
// À chaque passage (toutes les 30 minutes via GitHub Actions) :
//   1. app.bsky.graph.getList      → membres actuels de la liste (ajouts, retraits)
//   2. app.bsky.feed.getListFeed   → nouvelles publications des membres
//   3. app.bsky.feed.getAuthorFeed → pour chaque membre : republications, rattrapage
//      après une panne, historique initial d'un membre ajouté, suppressions
// Chaque élément est vérifié : il doit provenir d'un membre actif de la liste.
// L'historique est conservé dans data/veille/bluesky/AAAA-MM.json (un fichier
// par mois, sans doublon) et l'état dans data/veille/bluesky/etat.json.
//
// API publique officielle uniquement (public.api.bsky.app), sans compte ni
// mot de passe, sans aspiration de pages. Aucune dépendance : Node.js 20+.
//
// Utilisation : node collecteur/bluesky-liste.mjs [--simulation]
//   --simulation : interroge Bluesky et affiche le bilan sans rien écrire.
// =====================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const VB = require('../veille-bluesky.js');
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const H = 3600e3, J = 24*H;
const DEFAUTS = {historique_initial_jours:90, pages_max_liste:5, pages_max_rattrapage:3, pages_max_historique:20, chevauchement_heures:2, journal_max:100};

// ---------------------------------------------------------------------
// Cœur de la synchronisation (indépendant du réseau et du disque : testable)
//   get(nsid, params)  → réponse JSON de l'API (lève une erreur sinon)
//   lire(nom)          → contenu JSON d'un fichier de données, ou null
//   ecrire(nom, texte) / supprimer(nom)
// ---------------------------------------------------------------------
export async function synchroniser({config, get, lire, ecrire, supprimer, maintenant = () => new Date(), log = () => {}}){
  const C = Object.assign({}, DEFAUTS, config.bluesky||{});
  const now = maintenant(), nowIso = now.toISOString();
  const etat = (await lire('etat.json')) || {version:1, membres:[], mois:{}, journal:[]};
  const run = {date:nowIso, ok:false, nouvelles:0, mises_a_jour:0, supprimees:0, rejetees:0, ajouts:[], retraits:[], erreurs:[]};
  const appel = async (nsid, params) => { run.requetes = (run.requetes||0)+1; return get(nsid, params); };

  // Historique existant (tous les mois) : indexé par identifiant pour éviter les doublons
  const hist = new Map(), avant = {};
  for(const mois of Object.keys(etat.mois||{})){
    const f = await lire(mois+'.json');
    if(f && Array.isArray(f.publications)){ avant[mois] = serialiser(mois, f.publications); f.publications.forEach(p=>hist.set(p.id, p)); }
  }

  try{
    // ---------- 1. Liste et membres ----------
    if(!C.liste) throw new Error('Aucune liste Bluesky configurée (data/veille/config.json → bluesky.liste)');
    const L = VB.listUrlToUri(C.liste);
    let uri = L.uri;
    if(!uri){ const r = await appel('com.atproto.identity.resolveHandle', {handle:L.repo}); uri = `at://${r.did}/app.bsky.graph.list/${L.rkey}`; }
    const items = []; let cursor = null, info = null, n = 0;
    do{
      const r = await appel('app.bsky.graph.getList', {list:uri, limit:100, cursor});
      info = r.list; items.push(...(r.items||[])); cursor = r.cursor || null;
    }while(cursor && ++n < 50);
    etat.liste = {uri, url:C.liste, nom:info.name, description:info.description||'', createur:info.creator && info.creator.handle, nb_membres:items.length, lue_le:nowIso};

    const parDid = new Map(etat.membres.map(m=>[m.did, m])), actuels = new Set();
    for(const it of items){
      const s = it.subject; if(!s || !s.did) continue;
      actuels.add(s.did);
      let m = parDid.get(s.did);
      if(!m){ m = {did:s.did, ajoute_le:nowIso, historique_fait:false}; etat.membres.push(m); parDid.set(s.did, m); run.ajouts.push(s.handle); }
      else if(!m.actif){ m.retire_le = null; run.ajouts.push(s.handle); }
      Object.assign(m, {actif:true, handle:s.handle, nom:s.displayName||s.handle, avatar:s.avatar||null});
    }
    for(const m of etat.membres) if(m.actif && !actuels.has(m.did)){ m.actif = false; m.retire_le = nowIso; run.retraits.push(m.handle); }
    const actifs = new Map(etat.membres.filter(m=>m.actif).map(m=>[m.did, m]));
    log(`Liste « ${info.name} » : ${actifs.size} membre(s) actif(s)${run.ajouts.length?', ajout : '+run.ajouts.join(', '):''}${run.retraits.length?', retrait : '+run.retraits.join(', '):''}`);

    const ajouter = (p) => {
      if(!p || isNaN(new Date(p.date))) return;
      const ex = hist.get(p.id);
      if(!ex){ p.collecte_le = nowIso; hist.set(p.id, p); run.nouvelles++; return; }
      const maj = Object.assign({}, p, {collecte_le:ex.collecte_le});
      if(JSON.stringify(maj)!==JSON.stringify(ex)){ hist.set(p.id, maj); run.mises_a_jour++; }
    };
    const verifier = (it) => {           // l'élément doit provenir d'un membre actif
      const a = VB.actorOf(it);
      if(!a || !actifs.has(a)){ run.rejetees++; return null; }
      return VB.toPost(it, a);
    };

    // ---------- 2. Fil de la liste ----------
    const derniere = etat.derniere_synchro_reussie ? new Date(etat.derniere_synchro_reussie).getTime() : 0;
    const seuilListe = derniere ? derniere - C.chevauchement_heures*H : now - 2*J;
    cursor = null; n = 0;
    try{
      do{
        const r = await appel('app.bsky.feed.getListFeed', {list:uri, limit:100, cursor});
        const feed = r.feed||[]; feed.forEach(it=>ajouter(verifier(it)));
        cursor = r.cursor || null;
        const plusAncien = Math.min(...feed.map(it=>new Date(it.post.indexedAt||0).getTime()));
        if(!feed.length || plusAncien < seuilListe) break;
      }while(cursor && ++n < C.pages_max_liste);
    }catch(e){ run.erreurs.push('getListFeed : '+e.message); log('Fil de la liste indisponible : '+e.message); }

    // ---------- 3. Fil de chaque membre (reposts, rattrapage, historique, suppressions) ----------
    for(const m of actifs.values()){
      const initial = !m.historique_fait;
      const seuil = initial ? now - C.historique_initial_jours*J
        : Math.min(m.derniere_vue ? new Date(m.derniere_vue).getTime() - C.chevauchement_heures*H : Infinity, seuilListe);
      const pagesMax = initial ? C.pages_max_historique : C.pages_max_rattrapage;
      try{
        let cur = null, page = 0, atteint = false, vus1 = null, min1 = null;
        do{
          const r = await appel('app.bsky.feed.getAuthorFeed', {actor:m.did, limit:100, filter:'posts_with_replies', cursor:cur});
          const feed = r.feed||[], posts = [];
          for(const it of feed){
            if(VB.actorOf(it)!==m.did){ run.rejetees++; continue; }
            const p = VB.toPost(it, m.did); if(p){ posts.push(p); ajouter(p); }
          }
          cur = r.cursor || null;
          if(page===0){ vus1 = new Set(posts.map(p=>p.id)); min1 = posts.length ? Math.min(...posts.map(p=>new Date(p.indexe||p.date).getTime())) : null; if(!cur && !posts.length) min1 = -Infinity; }
          const plusAncien = posts.length ? Math.min(...posts.map(p=>new Date(p.date).getTime())) : -Infinity;
          if(plusAncien < seuil || !cur) atteint = true;
        }while(!atteint && cur && ++page < pagesMax);
        // Suppressions : publication de ce membre, dans la fenêtre de la 1re page, absente de celle-ci
        if(vus1 && min1!=null) for(const [id,p] of hist) if(p.did===m.did && new Date(p.indexe||p.date).getTime()>=min1 && !vus1.has(id)){ hist.delete(id); run.supprimees++; }
        const siens = [...hist.values()].filter(p=>p.did===m.did);
        m.derniere_vue = siens.length ? new Date(Math.max(...siens.map(p=>new Date(p.date).getTime()))).toISOString() : m.derniere_vue||null;
        m.derniere_collecte = nowIso; m.derniere_erreur = null;
        if(initial && (atteint || !cur)) m.historique_fait = true;
      }catch(e){
        m.derniere_erreur = e.message; m.derniere_erreur_le = nowIso;
        run.erreurs.push(`@${m.handle} : ${e.message}`); log(`@${m.handle} : ${e.message}`);
      }
    }
    run.ok = true;
  }catch(e){
    run.erreurs.push(e.message); log('Échec : '+e.message);
  }

  // ---------- 4. Enregistrement : un fichier par mois, sans doublon ----------
  const parMois = {};
  for(const p of hist.values()){ const k = p.date.slice(0,7); (parMois[k] = parMois[k]||[]).push(p); }
  const fichiers = {};
  for(const [k, list] of Object.entries(parMois)){
    list.sort((a,b)=>b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const txt = serialiser(k, list);
    if(avant[k]!==txt) fichiers[k+'.json'] = txt;
  }
  const disparus = Object.keys(avant).filter(k=>!parMois[k]);
  for(const m of etat.membres) m.publications = [...hist.values()].filter(p=>p.did===m.did).length;
  etat.mois = Object.fromEntries(Object.keys(parMois).sort().reverse().map(k=>[k, parMois[k].length]));
  etat.total = hist.size;
  etat.derniere_synchro = nowIso;
  if(run.ok) etat.derniere_synchro_reussie = nowIso;
  etat.journal = [run, ...(etat.journal||[])].slice(0, C.journal_max);
  etat.collecteur = 'collecteur/bluesky-liste.mjs';
  fichiers['etat.json'] = JSON.stringify(etat, null, 1)+'\n';
  for(const [nom, txt] of Object.entries(fichiers)) await ecrire(nom, txt);
  for(const k of disparus) await supprimer(k+'.json');
  log(`Bilan : ${run.nouvelles} nouvelle(s), ${run.mises_a_jour} mise(s) à jour, ${run.supprimees} supprimée(s), ${run.rejetees} rejetée(s), ${hist.size} au total, ${run.requetes||0} requête(s)${run.erreurs.length?', '+run.erreurs.length+' erreur(s)':''}`);
  return {run, etat, fichiers:Object.keys(fichiers), disparus};
}

// Une publication par ligne : fichiers lisibles et différences Git compactes
function serialiser(mois, list){
  return `{"mois":"${mois}","publications":[\n${list.map(p=>JSON.stringify(p)).join(',\n')}\n]}\n`;
}

// ---------------------------------------------------------------------
// Accès réseau : API publique officielle, nouvelles tentatives et limites
// ---------------------------------------------------------------------
export function clientBluesky({base = VB.API, pause = 250, essais = 4} = {}){
  let dernier = 0;
  return async function get(nsid, params){
    const q = new URLSearchParams(); for(const [k,v] of Object.entries(params||{})) if(v!=null && v!=='') q.set(k, String(v));
    const url = base+nsid+'?'+q;
    let err;
    for(let i=0;i<essais;i++){
      const attente = dernier + pause - Date.now(); if(attente>0) await new Promise(r=>setTimeout(r, attente));
      dernier = Date.now();
      try{
        const r = await fetch(url, {headers:{'Accept':'application/json','User-Agent':'veille-parlementaire-collecteur/1.0'}, signal:AbortSignal.timeout(20000)});
        if(r.ok) return await r.json();
        let body = {}; try{ body = await r.json(); }catch(e){}
        err = new Error(`${nsid} : HTTP ${r.status}${body.error?' '+body.error:''}${body.message?' — '+body.message:''}`); err.status = r.status;
        if(r.status!==429 && r.status<500) throw err;                        // erreur définitive
        const reset = +r.headers.get('ratelimit-reset');                      // limite de débit : attendre la remise à zéro
        const ms = r.status===429 && reset ? Math.min(Math.max(reset*1000-Date.now(), 1000), 60e3) : 1000*2**i;
        await new Promise(res=>setTimeout(res, ms));
      }catch(e){
        if(e.status && e.status!==429 && e.status<500) throw e;
        err = e.name==='TimeoutError' ? new Error(`${nsid} : délai de réponse dépassé`) : e;
        if(i<essais-1) await new Promise(res=>setTimeout(res, 1000*2**i));
      }
    }
    throw err;
  };
}

// ---------------------------------------------------------------------
// Lancement en ligne de commande
// ---------------------------------------------------------------------
async function main(){
  const simulation = process.argv.includes('--simulation');
  const dossier = path.join(RACINE, 'data/veille/bluesky');
  const config = JSON.parse(await fs.readFile(path.join(RACINE, 'data/veille/config.json'), 'utf8'));
  await fs.mkdir(dossier, {recursive:true});
  const res = await synchroniser({
    config, get:clientBluesky(), log:(m)=>console.log(m),
    lire: async (nom) => { try{ return JSON.parse(await fs.readFile(path.join(dossier, nom), 'utf8')); }catch(e){ if(e.code==='ENOENT') return null; throw e; } },
    ecrire: async (nom, txt) => { if(simulation) return console.log('[simulation] écrirait '+nom); await fs.writeFile(path.join(dossier, nom), txt); },
    supprimer: async (nom) => { if(simulation) return console.log('[simulation] supprimerait '+nom); await fs.rm(path.join(dossier, nom), {force:true}); }
  });
  if(!res.run.ok) process.exitCode = 1;   // la liste est inaccessible : GitHub Actions signale l'échec
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e); process.exit(1); });
