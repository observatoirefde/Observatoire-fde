#!/usr/bin/env node
// =====================================================================
// Collecteur automatique Instagram de la Veille parlementaire.
//
// API officielle « Business Discovery » de Meta (Instagram API avec
// connexion Facebook) : avec le jeton du compte professionnel de
// l'Observatoire, elle renvoie les publications publiques d'autres comptes
// PROFESSIONNELS (Business ou Créateur). Les comptes personnels et les
// Stories ne sont pas accessibles.
//
// Comptes suivis : comptes Instagram « verifie » de data/veille/comptes.json.
// Historique : data/veille/instagram/AAAA-MM.json (un fichier par mois, sans
// doublon) et data/veille/instagram/etat.json (état, journal).
// Récapitulatif : fichier Markdown (variable RECAP_FILE) publié par GitHub
// Actions en commentaire de l'issue « Veille Instagram ».
//
// Variables d'environnement : IG_TOKEN (secret GitHub, jamais dans le code).
// Réglages : data/veille/config.json → instagram.{ig_user_id, version_api…}
// Utilisation : IG_TOKEN=… node collecteur/instagram.mjs [--simulation]
// =====================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = 864e5;
const DEFAUTS = {version_api:'v27.0', par_page:25, pages_max:4, historique_initial_jours:90, journal_max:100, recap_vide:true};
const CHAMPS = 'id,caption,media_type,media_product_type,permalink,timestamp';

// « 2026-11-20T21:23:53+0000 » → ISO
const isoDate = s => { const d = new Date(String(s||'').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')); return isNaN(d) ? null : d.toISOString(); };

// Publication Instagram → format commun de la veille
export function toPost(m, compte){
  const date = isoDate(m.timestamp); if(!date || !m.permalink) return null;
  const reel = m.media_product_type==='REELS';
  return {id:'instagram:'+m.id, platform:'instagram', compte, uri:m.id, url:m.permalink, date,
    type: reel ? 'reel' : 'original', format: m.media_type||null, text: m.caption||'', facets:[], author:null, replyTo:null, embed:null, labels:[]};
}

// Erreurs de l'API Graph → message compréhensible et gravité
export function analyserErreur(e){
  const g = e.graph||{}, c = g.code, s = g.error_subcode;
  if(c===190) return {global:true, message:"Jeton Instagram invalide ou expiré : générez un nouveau jeton de page et mettez à jour le secret IG_TOKEN."};
  if([4,17,32,613].includes(c)) return {global:true, message:'Limite de requêtes de Meta atteinte : la collecte reprendra au passage suivant.'};
  if(c===10 || c===200) return {global:true, message:"Permission manquante pour Business Discovery (instagram_basic, instagram_manage_insights, pages_read_engagement, ads_read) : régénérez le jeton."};
  if(c===110 || s===2207013 || /Cannot find User|cannot be found|Invalid user id/i.test(g.message||e.message||'')) return {global:false, statut:'introuvable', message:"Compte introuvable ou non professionnel : Business Discovery ne lit que les comptes Business ou Créateur."};
  return {global:false, statut:'erreur', message:(g.message||e.message||'erreur inconnue')};
}

// ---------------------------------------------------------------------
// Cœur de la synchronisation (indépendant du réseau et du disque : testable)
//   comptes : [{pid, nom, username}]  ·  get(username, {limit, after}) → business_discovery
// ---------------------------------------------------------------------
export async function synchroniser({comptes, config, get, lire, ecrire, supprimer, maintenant = () => new Date(), log = () => {}, recap: faireRecap = true}){
  const C = Object.assign({}, DEFAUTS, (config&&config.instagram)||{});
  const now = maintenant(), nowIso = now.toISOString();
  const etat = (await lire('etat.json')) || {version:1, comptes:{}, mois:{}, journal:[]};
  const run = {date:nowIso, ok:false, nouveaux_comptes:[], nouvelles:0, mises_a_jour:0, supprimees:0, comptes_lus:0, comptes:comptes.length, requetes:0, erreurs:[]};
  const nouvelles = [];

  const hist = new Map(), avant = {};
  for(const mois of Object.keys(etat.mois||{})){
    const f = await lire(mois+'.json');
    if(f && Array.isArray(f.publications)){ avant[mois] = serialiser(mois, f.publications); f.publications.forEach(p=>hist.set(p.id, p)); }
  }
  const absents = etat.absents || {};                     // suppression confirmée après deux passages
  let arret = null;

  // comptes retirés du registre : historique conservé, plus de collecte
  const suivis = new Set(comptes.map(c=>c.username.toLowerCase()));
  for(const [u, e] of Object.entries(etat.comptes)) if(!suivis.has(u) && e.actif!==false){ e.actif = false; e.retire_le = nowIso; }

  for(const c of comptes){
    const u = c.username.toLowerCase();
    const e = etat.comptes[u] = Object.assign(etat.comptes[u]||{ajoute_le:nowIso, historique_fait:false}, {username:c.username, pid:c.pid, nom:c.nom, actif:true});
    if(arret){ continue; }
    const initial = !e.historique_fait, seuil = now - C.historique_initial_jours*J;
    try{
      let after = null, page = 0, vus1 = null, min1 = null, fin = false;
      do{
        run.requetes++;
        const bd = await get(c.username, {limit:C.par_page, after});
        const media = (bd.media && bd.media.data) || [];
        if(page===0){ e.media_count = bd.media_count ?? null; e.nom_instagram = bd.name || null; }
        const posts = media.map(m=>toPost(m, u)).filter(Boolean);
        let neufs = 0;
        for(const p of posts){
          const ex = hist.get(p.id);
          if(!ex){ p.collecte_le = nowIso; hist.set(p.id, p); run.nouvelles++; neufs++; if(!initial) nouvelles.push(p); }
          else{ const maj = Object.assign({}, p, {collecte_le:ex.collecte_le}); if(JSON.stringify(maj)!==JSON.stringify(ex)){ hist.set(p.id, maj); run.mises_a_jour++; } }
          delete absents[p.id];
        }
        if(page===0){ vus1 = new Set(posts.map(p=>p.id)); min1 = posts.length ? Math.min(...posts.map(p=>+new Date(p.date))) : null; }
        after = bd.media && bd.media.paging && bd.media.paging.cursors && bd.media.paging.cursors.after || null;
        const plusAncien = posts.length ? Math.min(...posts.map(p=>+new Date(p.date))) : -Infinity;
        // historique initial : jusqu'au seuil ; ensuite : page suivante seulement si toute la page était nouvelle
        fin = !after || !posts.length || (initial ? plusAncien < seuil : neufs < posts.length);
      }while(!fin && ++page < C.pages_max);
      // Suppressions : absente deux fois de suite de la première page alors qu'elle est dans sa période
      if(vus1 && min1!=null) for(const [id,p] of hist) if(p.compte===u && +new Date(p.date)>=min1 && !vus1.has(id)){
        absents[id] = (absents[id]||0)+1;
        if(absents[id]>=2){ hist.delete(id); delete absents[id]; run.supprimees++; }
      }
      if(initial) run.nouveaux_comptes.push({username:c.username, nom:c.nom, nom_instagram:e.nom_instagram, publications:[...hist.values()].filter(p=>p.compte===u).length});
      Object.assign(e, {statut:'ok', erreur:null, derniere_collecte:nowIso, historique_fait:true});
      run.comptes_lus++;
    }catch(err){
      const a = analyserErreur(err);
      Object.assign(e, {statut:a.statut||'erreur', erreur:a.message, derniere_erreur_le:nowIso});
      run.erreurs.push(`@${c.username} : ${a.message}`); log(`@${c.username} : ${a.message}`);
      if(a.global){ arret = a.message; e.statut = 'non lu'; }
    }
  }
  run.ok = !arret && run.comptes_lus>0;
  // Récapitulatif cumulé : publications et comptes nouveaux depuis le récapitulatif précédent
  etat.a_recapituler = [...new Set([...(etat.a_recapituler||[]), ...nouvelles.map(p=>p.id)])];
  etat.comptes_a_signaler = [...(etat.comptes_a_signaler||[]), ...run.nouveaux_comptes];
  let aRecap = [], comptesRecap = [];
  if(faireRecap){
    aRecap = etat.a_recapituler.map(id=>hist.get(id)).filter(Boolean);
    comptesRecap = etat.comptes_a_signaler;
    etat.dernier_recap_precedent = etat.dernier_recap || null;
    etat.a_recapituler = []; etat.comptes_a_signaler = []; etat.dernier_recap = nowIso;
  }
  if(arret) run.arret = arret;

  // Enregistrement : un fichier par mois
  for(const e of Object.values(etat.comptes)) e.publications = [...hist.values()].filter(p=>p.compte===(e.username||'').toLowerCase()).length;
  const parMois = {};
  for(const p of hist.values()){ const k = p.date.slice(0,7); (parMois[k] = parMois[k]||[]).push(p); }
  const fichiers = {};
  for(const [k, list] of Object.entries(parMois)){
    list.sort((a,b)=>b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const txt = serialiser(k, list); if(avant[k]!==txt) fichiers[k+'.json'] = txt;
  }
  const disparus = Object.keys(avant).filter(k=>!parMois[k]);
  etat.mois = Object.fromEntries(Object.keys(parMois).sort().reverse().map(k=>[k, parMois[k].length]));
  etat.total = hist.size; etat.absents = absents;
  etat.derniere_synchro = nowIso;
  if(run.ok) etat.derniere_synchro_reussie = nowIso;
  etat.journal = [run, ...(etat.journal||[])].slice(0, C.journal_max);
  fichiers['etat.json'] = JSON.stringify(etat, null, 1)+'\n';
  for(const [nom, txt] of Object.entries(fichiers)) await ecrire(nom, txt);
  for(const k of disparus) await supprimer(k+'.json');
  log(`Bilan : ${run.nouvelles} nouvelle(s), ${run.supprimees} supprimée(s), ${run.comptes_lus}/${comptes.length} compte(s) lu(s), ${run.requetes} requête(s)${run.erreurs.length?', '+run.erreurs.length+' erreur(s)':''}`);
  return {run, etat, nouvelles, recap: faireRecap ? recapitulatif({run, etat, nouvelles:aRecap, nouveauxComptes:comptesRecap, comptes, C}) : ''};
}

// ---------------------------------------------------------------------
// Récapitulatif Markdown (auteurs, dates, liens)
// ---------------------------------------------------------------------
const PARIS = d => new Date(d).toLocaleString('fr-FR', {timeZone:'Europe/Paris', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
const extrait = t => { const s = String(t||'').replace(/\s+/g,' ').trim(); return s.length>110 ? s.slice(0,110)+'…' : s; };
const md = s => String(s).replace(/([\\`*_\[\]<>|])/g, '\\$1');
export function recapitulatif({run, etat, nouvelles, nouveauxComptes = [], comptes, C}){
  if(!nouvelles.length && !nouveauxComptes.length && !run.erreurs.length && !C.recap_vide) return '';
  const reels = nouvelles.filter(p=>p.type==='reel').length;
  let s = `### Récapitulatif Instagram du ${PARIS(run.date)} (heure de Paris)\n\n`;
  if(run.arret) s += `> ⚠️ **Collecte interrompue : ${md(run.arret)}**\n\n`;
  s += nouvelles.length ? `**${nouvelles.length} nouvelle${nouvelles.length>1?'s':''} publication${nouvelles.length>1?'s':''}**${reels?` (dont ${reels} Reel${reels>1?'s':''})`:''} ${etat.dernier_recap_precedent?`depuis le récapitulatif du ${PARIS(etat.dernier_recap_precedent)}`:'depuis le récapitulatif précédent'}. `
    : 'Aucune nouvelle publication depuis le récapitulatif précédent. ';
  s += `${run.comptes_lus} compte${run.comptes_lus>1?'s':''} lu${run.comptes_lus>1?'s':''} sur ${comptes.length}.\n`;
  const parCompte = {};
  nouvelles.sort((a,b)=>b.date.localeCompare(a.date)).forEach(p=>(parCompte[p.compte] = parCompte[p.compte]||[]).push(p));
  for(const [u, list] of Object.entries(parCompte)){
    const e = etat.comptes[u]||{};
    s += `\n**${md(e.nom||u)}** ([@${md(e.username||u)}](https://www.instagram.com/${encodeURIComponent(e.username||u)}/))\n`;
    for(const p of list) s += `- ${PARIS(p.date)} · ${p.type==='reel'?'Reel':p.format==='CAROUSEL_ALBUM'?'Carrousel':p.format==='VIDEO'?'Vidéo':'Photo'} · ${p.url}${p.text?` — « ${md(extrait(p.text))} »`:''}\n`;
  }
  if(nouveauxComptes.length){
    s += `\n**Comptes collectés pour la première fois : vérifiez qu'il s'agit bien du parlementaire**\n`;
    for(const n of nouveauxComptes) s += `- @${md(n.username)} → ${md(n.nom)} · nom affiché par Instagram : « ${md(n.nom_instagram||'non renseigné')} » · ${n.publications} publication${n.publications>1?'s':''} récupérée${n.publications>1?'s':''} (historique, non listées ci-dessus)\n`;
  }
  const pb = Object.values(etat.comptes).filter(e=>e.actif!==false && e.statut && e.statut!=='ok');
  if(pb.length){ s += `\n**Comptes non lus**\n`; for(const e of pb) s += `- @${md(e.username)} (${md(e.nom||'')}) : ${md(e.erreur||e.statut)}\n`; }
  return s;
}

function serialiser(mois, list){
  return `{"mois":"${mois}","publications":[\n${list.map(p=>JSON.stringify(p)).join(',\n')}\n]}\n`;
}

// ---------------------------------------------------------------------
// Accès à l'API Graph (jeton dans l'en-tête, jamais dans les journaux)
// ---------------------------------------------------------------------
export function clientGraph({token, igUserId, version = DEFAUTS.version_api, essais = 3, pause = 400}){
  let dernier = 0;
  return async function get(username, {limit, after}){
    const media = `media${after?`.after(${after})`:''}.limit(${limit}){${CHAMPS}}`;
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}?fields=${encodeURIComponent(`business_discovery.username(${username}){username,name,media_count,${media}}`)}`;
    let err;
    for(let i=0;i<essais;i++){
      const attente = dernier + pause - Date.now(); if(attente>0) await new Promise(r=>setTimeout(r, attente));
      dernier = Date.now();
      try{
        const r = await fetch(url, {headers:{Authorization:'Bearer '+token, Accept:'application/json'}, signal:AbortSignal.timeout(20000)});
        const j = await r.json().catch(()=>({}));
        if(r.ok && j.business_discovery) return j.business_discovery;
        err = new Error((j.error && j.error.message) || `HTTP ${r.status}`); err.graph = j.error || {}; err.status = r.status;
        if(r.status<500 && !(j.error && j.error.is_transient)) throw err;   // erreur définitive : pas de nouvel essai
      }catch(e){
        if(e.graph && !(e.status>=500) && !e.graph.is_transient) throw e;
        err = e.name==='TimeoutError' ? new Error('délai de réponse dépassé') : e;
      }
      if(i<essais-1) await new Promise(r=>setTimeout(r, 2000*2**i));
    }
    throw err;
  };
}

// Comptes suivis : comptes Instagram vérifiés du registre de l'Observatoire
export function comptesSuivis(reg, deputes, senateurs){
  const noms = {};
  (deputes||[]).forEach(d=>noms[d.pa] = `${d.prenom} ${d.nom}`);
  (senateurs||[]).forEach(s=>noms[s.slug] = `${s.prenom} ${s.nom.toLowerCase().replace(/(^|[ -])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase())}`);
  const out = [];
  for(const [pid, v] of Object.entries(reg.parlementaires||{}))
    for(const a of v.comptes||[]) if(a.reseau==='instagram' && a.verification==='verifie' && a.identifiant && a.collecte!==false)
      out.push({pid, nom:noms[pid]||pid, username:a.identifiant.replace(/^@/,'')});
  return out;
}

async function main(){
  const simulation = process.argv.includes('--simulation');
  const lireJSON = async f => JSON.parse(await fs.readFile(path.join(RACINE, f), 'utf8'));
  const config = await lireJSON('data/veille/config.json');
  const C = Object.assign({}, DEFAUTS, config.instagram||{});
  const token = process.env.IG_TOKEN;
  if(!token) throw new Error("Variable IG_TOKEN absente : ajoutez le jeton dans les secrets GitHub (Settings → Secrets and variables → Actions).");
  if(!C.ig_user_id) throw new Error('Identifiant du compte Instagram de l\'Observatoire absent (data/veille/config.json → instagram.ig_user_id).');
  const reg = await lireJSON('data/veille/comptes.json');
  const dep = (await lireJSON('data/deputes-2026.json')).deputes, sen = (await lireJSON('data/senateurs-2026.json')).senateurs;
  const comptes = comptesSuivis(reg, dep, sen);
  const dossier = path.join(RACINE, 'data/veille/instagram');
  await fs.mkdir(dossier, {recursive:true});
  console.log(`${comptes.length} compte(s) Instagram suivi(s) : ${comptes.map(c=>'@'+c.username).join(', ')}`);
  const res = await synchroniser({
    comptes, config, log:m=>console.log(m), recap: process.env.RECAP !== '0',     // RECAP=0 : collecte seule, récapitulatif cumulé pour plus tard
    get: clientGraph({token, igUserId:C.ig_user_id, version:C.version_api}),
    lire: async n => { try{ return JSON.parse(await fs.readFile(path.join(dossier, n), 'utf8')); }catch(e){ if(e.code==='ENOENT') return null; throw e; } },
    ecrire: async (n, t) => { if(simulation) return console.log('[simulation] écrirait '+n); await fs.writeFile(path.join(dossier, n), t); },
    supprimer: async n => { if(simulation) return console.log('[simulation] supprimerait '+n); await fs.rm(path.join(dossier, n), {force:true}); }
  });
  if(process.env.RECAP_FILE && res.recap) await fs.writeFile(process.env.RECAP_FILE, res.recap);
  else if(simulation) console.log('\n'+res.recap);
  if(!res.run.ok) process.exitCode = 1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e.message); process.exit(1); });
