// =====================================================================
// Veille parlementaire : publications publiques des 23 parlementaires
// des Français établis hors de France.
//
// Bluesky : la source de référence est la liste Bluesky indiquée dans
// data/veille/config.json. Trois modes, choisis automatiquement :
//   « historique » : le site lit l'historique tenu à jour toutes les 30 minutes
//                    par le collecteur (collecteur/bluesky-liste.mjs, GitHub Actions),
//                    fichiers data/veille/bluesky/etat.json et AAAA-MM.json ;
//   « direct »     : secours si l'historique est absent : le navigateur lit la
//                    liste et les fils des membres via l'API publique ;
//   « comptes »    : sans liste configurée, comptes « collecte: true » de comptes.json.
// Autres réseaux : liens et sélection manuelle. Aucune publication n'est
// inventée : si une source ne répond pas, l'interface l'indique.
//
// Ajouter un réseau = ajouter une entrée dans CONNECTORS (fonction fetchPage
// qui renvoie des publications au format commun décrit plus bas).
// =====================================================================
(function(){
'use strict';

// ---------- Réseaux : état réel de l'accès (novembre 2026) ----------
const PLATFORMS = {
  bluesky:  {label:'Bluesky',   why:"API publique officielle de Bluesky, gratuite et sans clé. Les publications sont lues directement à chaque visite."},
  x:        {label:'X',         why:"L'API de X est payante à l'usage depuis février 2026 (pas d'offre gratuite). Collecte non activée : lien vers le profil uniquement."},
  facebook: {label:'Facebook',  why:"Lire les pages publiques d'autres personnes exige un agrément de Meta (« Page Public Content Access ») : lien vers le profil uniquement."},
  instagram:{label:'Instagram', why:"API officielle Business Discovery de Meta : collecte automatique deux fois par jour des comptes professionnels vérifiés (les comptes personnels et les Stories ne sont pas accessibles). Les publications s'affichent via l'intégration officielle d'Instagram, après un clic."},
  linkedin: {label:'LinkedIn',  why:"Aucune API ne permet de lire les publications d'autres membres. Publications choisies par l'Observatoire (sélection manuelle), affichées via l'intégration officielle de LinkedIn."},
  youtube:  {label:'YouTube',   why:"Aucune chaîne personnelle n'est mentionnée sur les fiches officielles. Les flux RSS de YouTube ne sont pas lisibles directement depuis un navigateur."}
};
const PORDER = ['bluesky','x','facebook','instagram','linkedin','youtube'];
const TYPES = {original:'Publication', reply:'Réponse', repost:'Republication', quote:'Citation', reel:'Reel', manual:'Sélection manuelle'};

// ---------- Utilitaires ----------
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const nrm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[’`]/g,"'").toLowerCase();
const safeUrl = u => /^https:\/\//i.test(String(u||'')) ? String(u) : '';
const $ = id => document.getElementById(id);
const fmtDT = d => new Date(d).toLocaleString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtD = d => new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
const fmtT = d => new Date(d).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const plural = (n,s,p) => n+' '+(n>1?(p||s+'s'):s);

// Requête JSON avec délai maximal et nouvelles tentatives (429, 5xx, réseau)
async function fetchJSON(url, tries=3, revalider=false){
  let last;
  for(let i=0;i<tries;i++){
    const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), 8000);
    try{
      const r = await fetch(url, Object.assign({signal:ctl.signal, headers:{'Accept':'application/json'}}, revalider?{cache:'no-cache'}:{}));
      clearTimeout(t);
      if(r.ok) return await r.json();
      let body={}; try{ body = await r.json(); }catch(e){}
      last = new Error(body.message || body.error || ('HTTP '+r.status)); last.status = r.status; last.code = body.error;
      if(r.status!==429 && r.status<500) throw last;           // erreur définitive (compte supprimé, etc.)
      const ra = +r.headers.get('Retry-After');
      await sleep(Math.min(ra>0 ? ra*1000 : 800*2**i, 8000));
    }catch(e){
      clearTimeout(t);
      if(e.status && e.status!==429 && e.status<500) throw e;
      last = e.name==='AbortError' ? new Error('délai de réponse dépassé') : e;
      if(e.name==='AbortError' && i>=1) break;   // pas plus de deux attentes de 8 s
      if(i<tries-1) await sleep(800*2**i);
    }
  }
  throw last;
}

// =====================================================================
// Connecteurs. Chacun expose fetchPage(compte, curseur) → {posts, cursor}.
// Format commun d'une publication :
//   {id, platform, url, date (ISO), type: original|reply|repost|quote,
//    text, facets, author (auteur d'origine si republication), replyTo,
//    embed {images|video|link|quote}, labels}
// =====================================================================
const VB = window.VeilleBluesky;   // module partagé avec le collecteur (veille-bluesky.js)
const CONNECTORS = {
  bluesky: {
    async fetchPage(acc, cursor){
      const q = new URLSearchParams({actor: acc.did || acc.identifiant, limit:'30', filter:'posts_with_replies'});
      if(cursor) q.set('cursor', cursor);
      const j = await fetchJSON(VB.API+'app.bsky.feed.getAuthorFeed?'+q);
      // seuls les éléments publiés ou republiés par ce compte sont retenus
      return {posts:(j.feed||[]).filter(it=>!acc.did || VB.actorOf(it)===acc.did).map(it=>bskyPost(it, acc)).filter(Boolean), cursor:j.cursor||null};
    }
  }
};
function bskyPost(it, acc){
  const p = VB.toPost(it, acc.did || (it.post&&it.post.author&&it.post.author.did));
  if(p) p.acc = acc.key;
  return p;
}

// Texte enrichi Bluesky : liens, mentions et mots-dièse (positions en octets UTF-8)
function richText(text, facets){
  if(!facets || !facets.length) return esc(text);
  const enc = new TextEncoder(), dec = new TextDecoder(), b = enc.encode(text);
  let out='', pos=0;
  facets.slice().sort((x,y)=>x.index.byteStart-y.index.byteStart).forEach(f=>{
    const s=f.index.byteStart, e=f.index.byteEnd;
    if(s<pos || e>b.length || s>=e) return;
    out += esc(dec.decode(b.slice(pos,s)));
    const seg = dec.decode(b.slice(s,e)), ft = (f.features||[])[0]||{};
    let href = '';
    if(ft.$type==='app.bsky.richtext.facet#link') href = safeUrl(ft.uri);
    else if(ft.$type==='app.bsky.richtext.facet#mention') href = 'https://bsky.app/profile/'+encodeURIComponent(ft.did);
    else if(ft.$type==='app.bsky.richtext.facet#tag') href = 'https://bsky.app/hashtag/'+encodeURIComponent(ft.tag);
    out += href ? `<a href="${esc(href)}" target="_blank" rel="noopener nofollow ugc">${esc(seg)}</a>` : esc(seg);
    pos = e;
  });
  return out + esc(dec.decode(b.slice(pos)));
}

// =====================================================================
// Sélection manuelle (data/veille/selection.json) : publications LinkedIn et
// Instagram choisies par l'Observatoire, affichées via l'intégration officielle
// du réseau. Aucune lecture automatique : seule l'adresse est fournie.
// =====================================================================
const MANUAL = {
  linkedin: {
    parse(raw){
      const src = (/src=["']([^"']+)["']/i.exec(raw)||[])[1] || raw;   // adresse ou code d'intégration complet
      let u; try{ u = new URL(src.trim()); }catch(e){ return {err:'adresse illisible'}; }
      if(!/(^|\.)linkedin\.com$/.test(u.hostname) || u.protocol!=='https:') return {err:"l'adresse n'est pas sur linkedin.com"};
      const m = /urn:li:(activity|share|ugcPost):(\d{15,22})/.exec(decodeURIComponent(u.pathname)) || /-(activity|share|ugcPost)-(\d{15,22})/.exec(u.pathname);
      if(!m) return {err:"identifiant de publication introuvable dans l'adresse"};
      const urn = `urn:li:${m[1]}:${m[2]}`;
      const vanity = (/^\/posts\/([^_\/]+)_/.exec(u.pathname)||[])[1] || null;
      let date = null; try{ date = new Date(Number(BigInt(m[2]) >> 22n)).toISOString(); }catch(e){}
      return {key:urn, embed:`https://www.linkedin.com/embed/feed/update/${urn}`, url:/^\/posts\//.test(u.pathname) ? u.origin+u.pathname : `https://www.linkedin.com/feed/update/${urn}/`, date, vanity, h:560};
    }
  },
  instagram: {
    parse(raw){
      let u; try{ u = new URL(String(raw).trim()); }catch(e){ return {err:'adresse illisible'}; }
      if(!/(^|\.)instagram\.com$/.test(u.hostname) || u.protocol!=='https:') return {err:"l'adresse n'est pas sur instagram.com"};
      const m = /^\/(?:[^\/]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]{5,})/.exec(u.pathname);
      if(!m) return {err:"ce n'est pas l'adresse d'une publication Instagram (…/p/… ou …/reel/…)"};
      return {key:m[1]+'/'+m[2], embed:`https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`, url:`https://www.instagram.com/${m[1]}/${m[2]}/`, date:null, h:640};
    }
  }
};
const MAN = [], SEL_ERR = [], SEL_WARN = [];
function loadSelection(sel){
  (sel && sel.publications || []).forEach((it,i)=>{
    const where = `entrée ${i+1}${it.parlementaire?' ('+it.parlementaire+')':''}`;
    const P = BYID[it.parlementaire], M = MANUAL[it.reseau];
    if(!P) return SEL_ERR.push(where+' : parlementaire inconnu');
    if(!M) return SEL_ERR.push(where+' : réseau non pris en charge (linkedin ou instagram)');
    const acc = P.accounts.find(a=>a.reseau===it.reseau);
    if(!acc) return SEL_ERR.push(where+` : aucun compte ${PLATFORMS[it.reseau].label} vérifié pour ce parlementaire`);
    const r = M.parse(it.url||'');
    if(r.err) return SEL_ERR.push(where+' : '+r.err);
    const d = it.date ? new Date(it.date) : r.date ? new Date(r.date) : null;
    if(!d || isNaN(d) || d < new Date('2010-01-01') || d > new Date(Date.now()+864e5)) return SEL_ERR.push(where+' : date absente ou invalide (format AAAA-MM-JJ)');
    if(r.vanity && acc.identifiant && r.vanity.toLowerCase()!==acc.identifiant.toLowerCase()) return SEL_ERR.push(where+` : l'adresse provient du compte « ${r.vanity} » et non du compte vérifié « ${acc.identifiant} »`);
    let mk = MAN.find(m=>m.pid===P.id && m.reseau===it.reseau);
    if(!mk){ mk = {key:'man:'+P.id+':'+it.reseau, pid:P.id, reseau:it.reseau, manual:true, url:acc.url}; MAN.push(mk); }
    const p = {id:'manual:'+it.reseau+':'+r.key, platform:it.reseau, acc:mk.key, pid:P.id, manual:true, url:r.url, date:d.toISOString(),
      type:'manual', text:String(it.extrait||''), facets:[], embed:{frame:{src:r.embed, h:r.h}}, labels:[], ajoute:it.ajoute_le||null, dateOnly:!!(it.date && /^\d{4}-\d{2}-\d{2}$/.test(String(it.date).trim()))};
    p.themes = p.text ? classify(p) : [];
    POSTS.set(p.id, p);
  });
}
const hasSource = P => isCollected(P) || MAN.some(m=>m.pid===P.id);

// =====================================================================
// Classement thématique par mots-clés (data/veille/themes.json)
// =====================================================================
let THEMES = [], THEME_OTHER = {id:'autres', label:'Autres sujets'}, THEME_VERSION = '';
function compileThemes(T){
  THEME_VERSION = T.version||''; if(T.autres) THEME_OTHER = T.autres;
  // ordre important : tirets, apostrophes et espaces d'abord (repères), puis jokers, puis classes de caractères
  const pat = m => nrm(m).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/-/g,'\u0001').replace(/'/g,'\u0002').replace(/\s+/g,'\u0003')
    .replace(/\\\*/g,'[a-z0-9]*').replace(/\u0001/g,'[-\\s]?').replace(/\u0002/g,"['\\s]?").replace(/\u0003/g,'[-\\s]+');
  THEMES = (T.themes||[]).map(t=>({id:t.id, label:t.label, re:new RegExp('(?:^|[^a-z0-9])(?:'+t.motifs.map(pat).join('|')+')(?![a-z0-9])')}));
}
function classify(p){
  const e = p.embed||{};
  const txt = nrm([p.text, e.link&&e.link.title, e.link&&e.link.desc, e.quote&&e.quote.text].filter(Boolean).join(' \n '));
  const ids = THEMES.filter(t=>t.re.test(txt)).map(t=>t.id);
  return ids.length ? ids : [THEME_OTHER.id];
}
const themeLabel = id => (THEMES.find(t=>t.id===id)||THEME_OTHER).label;

// =====================================================================
// État
// =====================================================================
let OBS = null, REG = null, READY = null, LOADING = null;
const PEOPLE = [], BYID = {};
const ACCS = [];                 // comptes collectés automatiquement
const ST = {};                   // état de collecte par compte
const POSTS = new Map();         // id → publication
let LAST_SYNC = null, FETCHED_AT = 0, SHOWN = 30, CUR_VIEW = 'veille';
// Liste Bluesky de référence
let CFG = {}, MODE = 'comptes', ETAT = null, HBASE = null, MEMBERS = [], LIST_INFO = null, LIST_ERR = '';
let MONTHS = []; const LOADED = new Set(), ACC_BY_DID = {};
// Historique Instagram (collecteur/instagram.mjs, GitHub Actions deux fois par jour)
let IG = null; const IG_BASE = './data/veille/instagram/', IG_ACC = {};
const F = {q:'', role:'', pid:'', grp:'', circ:'', net:'', per:'', theme:'', type:''};
const CACHE_KEY = 'veille_cache_v1', CACHE_TTL = 10*60*1000, MAX_PAGES = 20;

function buildPeople(){
  const D = (OBS.DEP && OBS.DEP.deputes) || [], S = OBS.SEN || [];
  D.forEach(d=>PEOPLE.push({id:d.pa, kind:'dep', civ:d.civ, prenom:d.prenom, nom:d.nom, g:d.g,
    role:(d.civ==='Mme'?'Députée':'Député'), place:`${OBS.ORD(d.g)} circonscription · ${OBS.LEG[d.g]}`,
    groupe:d.groupe, gkey:'AN:'+d.groupe, chamber:'Assemblée nationale', col:OBS.grpColor(d.groupe),
    fiche:'https://www.assemblee-nationale.fr/dyn/deputes/'+d.pa, ficheLabel:"Fiche officielle à l'Assemblée nationale",
    photo:cls=>OBS.photoHTML(d,cls), src:d}));
  S.forEach(s=>PEOPLE.push({id:s.slug, kind:'sen', civ:s.civ, prenom:s.prenom, nom:s.nom, g:null,
    role:(s.civ==='Mme'?'Sénatrice':'Sénateur'), place:'Français établis hors de France · série '+s.serie,
    groupe:OBS.RSE.groupes[s.groupe], gkey:'SEN:'+s.groupe, chamber:'Sénat', col:OBS.SGRP_COL[s.groupe]||'#A3A8AF',
    fiche:s.fiche, ficheLabel:'Fiche officielle au Sénat', photo:cls=>OBS.senPhoto(s,cls), src:s}));
  PEOPLE.forEach(p=>{
    BYID[p.id] = p;
    const r = (REG.parlementaires[p.id]||{}).comptes || [];
    p.accounts = r.filter(a=>a.verification==='verifie' && safeUrl(a.url));
    p.pending = r.filter(a=>a.verification!=='verifie');
    p.accounts.forEach(a=>{
      a.key = p.id+':'+a.reseau+':'+(a.did||a.identifiant); a.pid = p.id;
      if(a.collecte && CONNECTORS[a.reseau] && !(MODE!=='comptes' && a.reseau==='bluesky')){ ACCS.push(a); ST[a.key] = newState(); }
    });
  });
  if(MODE!=='comptes') setupMembers(MEMBERS);
}
const newState = () => ({state:'attente', n:0, pages:0, cursor:null, done:false, oldest:null, at:null, err:''});

// Membres de la liste → parlementaires de l'annuaire (par identifiant DID, sinon par nom exact)
function setupMembers(members){
  members.forEach(m=>{
    let pid = null;
    for(const [id,v] of Object.entries(REG.parlementaires)) if((v.comptes||[]).some(a=>a.reseau==='bluesky' && a.did===m.did)){ pid = id; break; }
    if(!pid){ const n = nrm(m.nom); const P = n && PEOPLE.find(p=>nrm(p.prenom+' '+p.nom)===n); if(P){ pid = P.id; m.rattachement = 'nom'; } }
    else m.rattachement = 'did';
    let P = pid && BYID[pid];
    if(!P){
      P = {id:'bsky:'+m.did, kind:'autre', civ:'', prenom:m.nom||m.handle, nom:'', g:null, role:'Compte Bluesky de la liste', place:"Non rattaché à l'annuaire des parlementaires",
        groupe:'Non rattaché', gkey:'NR', chamber:'Bluesky', col:'#A3A8AF', fiche:'https://bsky.app/profile/'+encodeURIComponent(m.handle||m.did), ficheLabel:'Profil Bluesky',
        photo:cls=>`<figure class="portrait ${cls}"><img src="${esc(safeUrl(m.avatar)||'./assets/depute-neutre.svg')}" alt="Avatar Bluesky de ${esc(m.nom||m.handle)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='./assets/depute-neutre.svg'"></figure>`,
        accounts:[], pending:[]};
      m.rattachement = null; PEOPLE.push(P); BYID[P.id] = P;
    }
    let acc = P.accounts.find(a=>a.reseau==='bluesky' && a.did===m.did);
    if(!acc){
      const i = P.pending.findIndex(a=>a.reseau==='bluesky' && a.did===m.did);
      acc = i>=0 ? P.pending.splice(i,1)[0] : {reseau:'bluesky', did:m.did};
      P.accounts.push(acc);
    }
    Object.assign(acc, {identifiant:m.handle||acc.identifiant, url:'https://bsky.app/profile/'+encodeURIComponent(m.handle||m.did), key:P.id+':bluesky:'+m.did, pid:P.id, via:'liste', actif:m.actif!==false, membre:m});
    if(acc.verification!=='verifie'){ acc.verification = 'liste'; acc.source = "Liste Bluesky de l'Observatoire"; acc.source_url = CFG.bluesky.liste; acc.verifie_le = null; }
    ACCS.push(acc); ST[acc.key] = newState(); ACC_BY_DID[m.did] = acc;
  });
}

// Choix du mode : historique collecté (distant puis local), sinon lecture directe de la liste
async function prepareBluesky(){
  const bc = CFG.bluesky||{};
  if(!bc.liste){ MODE = 'comptes'; return; }
  const bases = [bc.donnees_distantes, './data/veille/bluesky/'].filter(Boolean).map(b=>b.replace(/\/?$/,'/'));
  let best = null;
  for(const b of bases){
    try{ const e = await fetchJSON(b+'etat.json', 2, true); if(e && Array.isArray(e.membres) && e.mois && (!best || String(e.derniere_synchro)>String(best.e.derniere_synchro))) best = {b, e}; }catch(e){}
  }
  if(best){ MODE = 'historique'; ETAT = best.e; HBASE = best.b; MEMBERS = ETAT.membres; LIST_INFO = ETAT.liste||null; return; }
  try{
    const L = VB.listUrlToUri(bc.liste); let uri = L.uri;
    if(!uri){ const r = await fetchJSON(VB.API+'com.atproto.identity.resolveHandle?handle='+encodeURIComponent(L.repo)); uri = `at://${r.did}/app.bsky.graph.list/${L.rkey}`; }
    const items = []; let cursor = null, n = 0, info = null;
    do{ const r = await fetchJSON(VB.API+'app.bsky.graph.getList?'+new URLSearchParams(Object.assign({list:uri, limit:'100'}, cursor?{cursor}:{})));
      info = r.list; items.push(...(r.items||[])); cursor = r.cursor||null; }while(cursor && ++n<20);
    MEMBERS = items.map(it=>({did:it.subject.did, handle:it.subject.handle, nom:it.subject.displayName||it.subject.handle, avatar:it.subject.avatar||null, actif:true}));
    LIST_INFO = {uri, url:bc.liste, nom:info.name, createur:info.creator&&info.creator.handle, nb_membres:items.length};
    MODE = 'direct';
  }catch(e){ MODE = 'comptes'; LIST_ERR = 'Liste Bluesky inaccessible : '+humanError(e); }
}

// Mode « historique » : un fichier par mois, chargé à la demande
async function loadMonth(k){
  if(LOADED.has(k)) return;
  const jobs = [];
  if(HBASE && ETAT && ETAT.mois && ETAT.mois[k]) jobs.push(fetchJSON(HBASE+k+'.json', 3, k===MONTHS[0]).then(f=>{
    (f.publications||[]).forEach(p=>{
      const a = ACC_BY_DID[p.did]; if(!a) return;               // provenance vérifiée : membre de la liste
      p.acc = a.key; p.pid = a.pid; p.themes = classify(p); POSTS.set(p.id, p);
    }); }));
  if(IG && IG.mois && IG.mois[k]) jobs.push(fetchJSON(IG_BASE+k+'.json', 3, k===MONTHS[0]).then(addInstagram));
  await Promise.all(jobs);
  LOADED.add(k);
}
// Publications Instagram collectées : compte vérifié de l'annuaire, intégration officielle au clic
function addInstagram(f){
  (f.publications||[]).forEach(p=>{
    const a = IG_ACC[String(p.compte||'').toLowerCase()]; if(!a || !/^https:\/\/www\.instagram\.com\//.test(p.url)) return;
    p.acc = a.key; p.pid = a.pid; p.themes = classify(p);
    p.embed = {frame:{src:p.url.replace(/\/?$/,'/')+'embed/captioned/', h:640}};
    for(const [id,m] of POSTS) if(m.manual && m.platform==='instagram' && m.url.replace(/\/$/,'')===p.url.replace(/\/$/,'')) POSTS.delete(id);   // déjà en sélection manuelle
    POSTS.set(p.id, p);
  });
}
async function prepareInstagram(){
  try{ IG = await fetchJSON(IG_BASE+'etat.json', 2, true); }catch(e){ IG = null; return; }
  if(!IG || !IG.comptes || !IG.mois){ IG = null; return; }
  for(const [u, c] of Object.entries(IG.comptes)){
    const P = BYID[c.pid]; if(!P) continue;
    let acc = P.accounts.find(a=>a.reseau==='instagram' && String(a.identifiant||'').toLowerCase()===u);
    if(!acc){                                                     // compte indiqué mais non vérifié : affiché avec mention
      const i = P.pending.findIndex(a=>a.reseau==='instagram' && String(a.identifiant||'').replace(/^@/,'').toLowerCase()===u);
      if(i<0) continue;
      acc = P.pending.splice(i,1)[0];
      acc.url = safeUrl(acc.url) || 'https://www.instagram.com/'+encodeURIComponent(u)+'/'; acc.nonVerifie = true;
      P.accounts.push(acc);
    }
    Object.assign(acc, {key:P.id+':instagram:'+u, pid:P.id, via:'instagram', actif:c.actif!==false, igc:c});
    if(!ACCS.includes(acc)){ ACCS.push(acc); ST[acc.key] = newState(); }
    IG_ACC[u] = acc;
  }
}
function paintHistoryState(){
  const more = MONTHS.some(k=>!LOADED.has(k));
  ACCS.forEach(a=>{ if(a.igc){ const c = a.igc, st = ST[a.key];
      st.state = c.statut==='ok' ? 'ok' : c.statut ? 'erreur' : 'attente'; st.err = c.erreur||''; st.at = c.derniere_collecte||null; st.done = !more; st.total = c.publications;
      st.n = [...POSTS.values()].filter(p=>p.acc===a.key).length; return; }
    if(!a.membre) return; const m = a.membre, st = ST[a.key];
    st.state = m.derniere_erreur ? 'erreur' : m.derniere_collecte ? 'ok' : 'attente'; st.err = m.derniere_erreur ? humanError({message:m.derniere_erreur}) : '';
    st.at = m.derniere_collecte||null; st.done = !more; st.total = m.publications;
    st.n = [...POSTS.values()].filter(p=>p.acc===a.key).length; });
  LAST_SYNC = (ETAT && ETAT.derniere_synchro_reussie) || null;
}
const unionMois = () => [...new Set([...Object.keys((ETAT&&ETAT.mois)||{}), ...Object.keys((IG&&IG.mois)||{})])].sort().reverse();
async function syncHistory(force){
  if(force){
    try{ const e = await fetchJSON(HBASE+'etat.json', 2, true); if(e && e.membres){
      const nouveaux = e.membres.some(m=>!ACC_BY_DID[m.did]);
      ETAT = e; e.membres.forEach(m=>{ const a = ACC_BY_DID[m.did]; if(a){ Object.assign(a.membre, m); a.actif = m.actif!==false; } });
      if(nouveaux) LIST_ERR = 'La liste a changé : rechargez la page pour afficher les nouveaux membres.';
    } }catch(e){}
    if(IG) try{ const g = await fetchJSON(IG_BASE+'etat.json', 2, true); if(g && g.comptes){ IG = g; ACCS.forEach(a=>{ if(a.igc){ const c = g.comptes[String(a.identifiant).toLowerCase()]; if(c){ a.igc = c; a.actif = c.actif!==false; } } }); } }catch(e){}
    const recent = unionMois()[0]; if(recent) LOADED.delete(recent);
  }
  MONTHS = unionMois();
  try{
    for(const k of MONTHS){ await loadMonth(k); if(LOADED.size>=2 || POSTS.size>=60) break; }
  }catch(e){ LIST_ERR = "Historique indisponible : "+humanError(e); }
  paintHistoryState();
}
const hasMore = () => MODE==='historique' ? MONTHS.some(k=>!LOADED.has(k)) : ACCS.some(a=>accMatches(a) && !ST[a.key].done && ST[a.key].state==='ok');
const personName = p => p.kind==='autre' ? esc(p.prenom) : `${esc(p.prenom)} ${esc(p.kind==='sen' ? p.nom.toLowerCase().replace(/(^|[ -])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()) : p.nom)}`;
const isCollected = p => ACCS.some(a=>a.pid===p.id);

// ---------- Cache de session (évite de réinterroger les API à chaque onglet) ----------
function saveCache(){
  try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({at:Date.now(), sync:LAST_SYNC, st:ST, posts:[...POSTS.values()].filter(p=>!p.manual)})); }catch(e){}
}
function loadCache(){
  try{
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(!c || Date.now()-c.at > CACHE_TTL) return false;
    if(!ACCS.every(a=>c.st[a.key])) return false;
    ACCS.forEach(a=>Object.assign(ST[a.key], c.st[a.key]));
    c.posts.forEach(p=>{ if(BYID[(ACCS.find(a=>a.key===p.acc)||{}).pid]) POSTS.set(p.id, p); });
    LAST_SYNC = c.sync; return true;
  }catch(e){ return false; }
}

// ---------- Collecte ----------
function addPosts(acc, posts, firstPage){
  const st = ST[acc.key];
  if(firstPage && posts.length){
    // publications supprimées : absentes de la première page alors qu'elles y figuraient
    const lim = Math.min(...posts.map(p=>+new Date(p.date)));
    const ids = new Set(posts.map(p=>p.id));
    for(const [id,p] of POSTS) if(p.acc===acc.key && +new Date(p.date)>=lim && !ids.has(id)) POSTS.delete(id);
  }
  posts.forEach(p=>{ p.pid = acc.pid; p.themes = classify(p); p.tv = THEME_VERSION; POSTS.set(p.id, p); });
  const mine = [...POSTS.values()].filter(p=>p.acc===acc.key);
  st.n = mine.length;
  st.oldest = mine.length ? Math.min(...mine.map(p=>+new Date(p.date))) : null;
}
async function fetchAccount(acc, older){
  const st = ST[acc.key];
  if(older && (st.done || !st.cursor || st.pages>=MAX_PAGES)) return;
  st.state = 'en cours'; paintStatus();
  try{
    const r = await CONNECTORS[acc.reseau].fetchPage(acc, older ? st.cursor : null);
    if(older){ st.cursor = r.cursor; st.pages++; if(!r.cursor || !r.posts.length) st.done = true; }
    else if(!st.pages){ st.cursor = r.cursor; st.pages = 1; st.done = !r.cursor; }  // une actualisation conserve le curseur des pages anciennes
    addPosts(acc, r.posts, !older);
    st.state = 'ok'; st.err = ''; st.at = new Date().toISOString();
  }catch(e){
    st.state = 'erreur'; st.err = humanError(e); st.at = st.at || null;
  }
}
function humanError(e){
  const c = e.code||'';
  if(/Deactivated/i.test(c)) return 'compte désactivé par son titulaire';
  if(/Takedown|Suspended/i.test(c)) return 'compte suspendu par la plateforme';
  if(/NotFound|not found/i.test(c+e.message)) return 'compte introuvable';
  if(e.status===429) return 'trop de requêtes, réessayez dans quelques minutes';
  return 'source injoignable ('+(e.message||'erreur inconnue')+')';
}
async function pool(list, fn, n=3){
  const q = list.slice(); await Promise.all(Array.from({length:Math.min(n,q.length)}, async()=>{ while(q.length) await fn(q.shift()); }));
}
function syncAll(force){
  if(LOADING) return LOADING;
  if(MODE==='historique'){
    LOADING = syncHistory(force).finally(()=>{ FETCHED_AT = Date.now(); LOADING = null; refresh(); });
    return LOADING;
  }
  if(!force && loadCache()){ FETCHED_AT = Date.now(); refresh(); return Promise.resolve(); }
  LOADING = (async()=>{
    paintStatus();
    await pool(ACCS.filter(a=>!a.igc), a=>fetchAccount(a,false));
    if(IG){                                                        // historique Instagram : deux mois les plus récents
      try{ for(const k of Object.keys(IG.mois).sort().reverse().slice(0,2)) addInstagram(await fetchJSON(IG_BASE+k+'.json', 3, true)); }catch(e){}
      ACCS.filter(a=>a.igc).forEach(a=>Object.assign(ST[a.key], {state:a.igc.statut==='ok'?'ok':'erreur', err:a.igc.erreur||'', at:a.igc.derniere_collecte||null, done:true, n:[...POSTS.values()].filter(p=>p.acc===a.key).length}));
    }
    if(ACCS.some(a=>ST[a.key].state==='ok')) LAST_SYNC = new Date().toISOString();
    saveCache();
  })().finally(()=>{ FETCHED_AT = Date.now(); LOADING = null; refresh(); });
  return LOADING;
}
async function syncOne(pid){
  if(MODE==='historique') return;
  const list = ACCS.filter(a=>a.pid===pid && !ST[a.key].at && ST[a.key].state!=='en cours');
  if(!list.length) return;
  await pool(list, a=>fetchAccount(a,false)); saveCache();
}

// ---------- Fil : filtres ----------
function accMatches(a){
  const p = BYID[a.pid];
  return (!F.pid || p.id===F.pid) && (!F.role || p.kind===F.role) && (!F.grp || p.gkey===F.grp) && (!F.circ || p.g===+F.circ) && (!F.net || a.reseau===F.net);
}
// Limite basse cohérente : en dessous, une partie des comptes n'a pas encore été chargée
function horizon(){
  if(MODE==='historique'){
    if(!MONTHS.some(k=>!LOADED.has(k))) return -Infinity;
    const plusAncien = MONTHS.filter(k=>LOADED.has(k)).pop();
    return plusAncien ? Date.parse(plusAncien+'-01T00:00:00Z') : Infinity;
  }
  let h = -Infinity;
  ACCS.filter(accMatches).forEach(a=>{ const s=ST[a.key]; if(s.state!=='erreur' && !s.done && s.oldest!=null) h = Math.max(h, s.oldest); });
  return h;
}
function since(){
  const d = {'1':1,'7':7,'30':30,'90':90,'365':365}[F.per];
  return d ? Date.now()-d*864e5 : -Infinity;
}
function filtered(){
  const h = horizon(), s = since(), q = nrm(F.q).trim(), words = q ? q.split(/\s+/) : [];
  return [...POSTS.values()].filter(p=>{
    const a = ACCS.find(x=>x.key===p.acc) || MAN.find(x=>x.key===p.acc); if(!a || !accMatches(a)) return false;
    const t = +new Date(p.date);
    if((!p.manual && t<h) || t<s) return false;
    if(F.type && p.type!==F.type) return false;
    if(F.theme && !p.themes.includes(F.theme)) return false;
    if(words.length){
      const e = p.embed||{}, hay = nrm([p.text, p.author&&p.author.name, e.link&&e.link.title, e.link&&e.link.desc, e.quote&&e.quote.text].join(' '));
      if(!words.every(w=>hay.includes(w))) return false;
    }
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));
}
async function loadOlder(){
  const before = filtered().length;
  if(MODE==='historique'){
    for(const k of MONTHS){ if(LOADED.has(k)) continue; try{ await loadMonth(k); }catch(e){ LIST_ERR = 'Historique indisponible : '+humanError(e); break; } if(filtered().length >= before+10) break; }
    paintHistoryState(); return;
  }
  for(let k=0;k<4;k++){
    const cand = ACCS.filter(a=>accMatches(a) && !ST[a.key].done && ST[a.key].state!=='erreur' && ST[a.key].oldest!=null);
    if(!cand.length) return;
    const h = Math.max(...cand.map(a=>ST[a.key].oldest));
    await pool(cand.filter(a=>ST[a.key].oldest>=h-36e5), a=>fetchAccount(a,true));   // comptes qui fixent la limite basse
    saveCache();
    if(filtered().length >= before+10) return;
  }
}

// =====================================================================
// Rendu
// =====================================================================
const SENSITIVE = /^(porn|sexual|nudity|graphic-media|gore|!hide|!warn)$/;
function frameHTML(p){
  const f = p.embed.frame, plat = PLATFORMS[p.platform].label;
  return `<div class="vframe" data-src="${esc(f.src)}" data-h="${+f.h||560}" data-title="Publication ${esc(plat)} de ${esc(BYID[p.pid].prenom+' '+BYID[p.pid].nom)}">
    <button type="button" class="lnk vload">Afficher la publication (contenu fourni par ${esc(plat)})</button>
    <span class="small">Le chargement transmet votre adresse IP à ${esc(plat)}, qui peut déposer des cookies.</span></div>`;
}
function loadFrame(btn){
  const box = btn.closest('.vframe'); if(!box || !/^https:\/\/www\.(linkedin|instagram)\.com\//.test(box.dataset.src)) return;
  const f = document.createElement('iframe');
  f.src = box.dataset.src; f.title = box.dataset.title; f.loading = 'lazy'; f.height = box.dataset.h; f.setAttribute('allowfullscreen','');
  f.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  box.replaceChildren(f); box.classList.add('on');
}
function mediaHTML(p, compact){
  const e = p.embed||{}; let h = '';
  if(e.frame) return compact ? '' : frameHTML(p);
  const hide = (p.labels||[]).some(l=>SENSITIVE.test(l));
  if(hide && (e.images||e.video)) h += `<div class="vmask">Média masqué : contenu signalé comme sensible par la plateforme. <a href="${esc(p.url)}" target="_blank" rel="noopener">Voir la publication d'origine ↗</a></div>`;
  else if(e.images && e.images.length && !compact){
    const im = e.images.slice(0,4).filter(i=>safeUrl(i.thumb));
    h += `<div class="vimgs n${im.length}">`+im.map(i=>`<a href="${esc(p.url)}" target="_blank" rel="noopener" class="vimg"><img src="${esc(i.thumb)}" alt="${esc(i.alt||'Image sans description')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${i.ar&&im.length===1?` style="aspect-ratio:${+i.ar.width||1}/${+i.ar.height||1}"`:''}></a>`).join('')+'</div>';
  } else if(e.images && e.images.length) h += `<div class="small">${plural(e.images.length,'image')} · à voir sur la publication d'origine</div>`;
  if(e.video && !hide){
    h += compact || !safeUrl(e.video.thumb) ? `<div class="small">Vidéo · à voir sur la publication d'origine</div>`
      : `<a class="vvideo" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Lire la vidéo sur Bluesky"><img src="${esc(e.video.thumb)}" alt="${esc(e.video.alt||'Vidéo')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span aria-hidden="true">▶</span></a>`;
  }
  if(e.link && safeUrl(e.link.uri)){
    let dom=''; try{ dom = new URL(e.link.uri).hostname.replace(/^www\./,''); }catch(x){}
    h += `<a class="vlink" href="${esc(e.link.uri)}" target="_blank" rel="noopener nofollow ugc">${!compact&&safeUrl(e.link.thumb)?`<img src="${esc(e.link.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}<span><small>${esc(dom)}</small><b>${esc(e.link.title||e.link.uri)}</b>${e.link.desc&&!compact?`<em>${esc(e.link.desc)}</em>`:''}</span></a>`;
  }
  if(e.quote){
    h += e.quote.missing ? `<div class="vquote small">Publication citée indisponible (supprimée ou masquée).</div>`
      : `<a class="vquote" href="${esc(e.quote.url)}" target="_blank" rel="noopener"><small>${esc(e.quote.name)} · @${esc(e.quote.handle)}${e.quote.date?' · '+fmtD(e.quote.date):''}</small><span>${esc(e.quote.text.length>400?e.quote.text.slice(0,400)+'…':e.quote.text)}</span></a>`;
  }
  return h;
}
function postHTML(p, compact){
  const P = BYID[p.pid], plat = PLATFORMS[p.platform];
  let ctx = '';
  if(p.type==='repost') ctx = `<div class="vctx">↻ ${personName(P)} a republié <a href="${esc(p.author.url)}" target="_blank" rel="noopener">${esc(p.author.name)}</a> <span class="small">@${esc(p.author.handle)}</span></div>`;
  else if(p.type==='reply') ctx = `<div class="vctx">↩ Réponse${p.replyTo&&p.replyTo.handle?` à ${esc(p.replyTo.name)} <span class="small">@${esc(p.replyTo.handle)}</span>`:''}</div>`;
  const themes = p.themes.length ? p.themes.map(t=>`<button type="button" class="vtheme" data-theme="${esc(t)}" title="Filtrer sur ce thème (détection automatique par mots-clés)">${esc(themeLabel(t))}</button>`).join('')
    : p.manual ? '<span class="small">Thème non déterminé : texte non disponible</span>' : '';
  return `<article class="glass vpost t-${p.type}" aria-label="${esc(TYPES[p.type])} de ${esc(P.prenom+' '+P.nom)}, ${esc(fmtDT(p.date))}">
    <header class="vhead">
      <button type="button" class="vwho" data-k="veille" data-i="${esc(P.id)}" title="Ouvrir la fiche">${P.photo('hp-photo')}<span class="hp-txt"><b>${personName(P)}</b><span>${esc(P.role)} · <span class="sw" style="background:${esc(P.col)}"></span>${esc(P.groupe)}</span></span></button>
      <div class="vmeta"><span class="vplat p-${esc(p.platform)}">${esc(plat.label)}</span><span class="vtype">${esc(TYPES[p.type])}</span><time datetime="${esc(p.dateOnly?p.date.slice(0,10):p.date)}">${esc(p.dateOnly?fmtD(p.date):fmtDT(p.date))}</time></div>
    </header>
    ${ctx}
    ${p.manual&&p.text?'<div class="restitle">Extrait</div>':''}
    ${p.text?`<div class="vtext">${richText(compact&&p.text.length>280?p.text.slice(0,280)+'…':p.text, compact&&p.text.length>280?[]:p.facets)}</div>`:''}
    ${mediaHTML(p, compact)}
    <footer class="vfoot"><div class="vthemes">${themes}</div><a class="dep-link" href="${esc(p.url)}" target="_blank" rel="noopener">Voir sur ${esc(plat.label)} ↗</a></footer>
  </article>`;
}
function chipsHTML(P, withPending){
  const a = PORDER.flatMap(r=>P.accounts.filter(x=>x.reseau===r)).map(x=>{
    const illisible = x.igc && x.igc.statut && x.igc.statut!=='ok';
    const coll = ACCS.includes(x) && x.actif!==false && !illisible;
    return `<a class="vchip p-${esc(x.reseau)}" href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc((coll?'Collecté automatiquement':x.via==='liste'?'Retiré de la liste : historique conservé':'Lien uniquement, non collecté')+' · source : '+x.source)}"><b>${esc(PLATFORMS[x.reseau].label)}</b>${x.identifiant?` <span>${esc(x.reseau==='bluesky'||x.reseau==='x'?'@'+x.identifiant:x.identifiant)}</span>`:''}${coll?' <i class="vok">collecté</i>':illisible?' <i class="vpend">non lisible</i>':''}${x.nonVerifie?' <i class="vpend">non vérifié</i>':''}</a>`;
  }).join('');
  let h = a || '<span class="small">Aucun compte public mentionné sur la fiche officielle.</span>';
  if(withPending && P.pending.length) h += `<span class="small vpend">À vérifier : ${P.pending.map(x=>esc(PLATFORMS[x.reseau].label)).join(', ')}</span>`;
  return `<div class="vchips">${h}</div>`;
}
function coverageBanner(){
  return `<p class="small">Ce fil n'est pas exhaustif : il regroupe les publications publiques disponibles sur les réseaux collectés et les sélections manuelles.</p>`;
}
function paintStatus(){
  const b = $('vCov'); if(b && CUR_VIEW==='veille') b.innerHTML = coverageBanner();
  const f = $('vFeed'); if(f) f.setAttribute('aria-busy', ACCS.some(a=>ST[a.key].state==='en cours') ? 'true':'false');
}

// --- Vue « Fil d'actualité » ---
let filtersReady = false;
function initFilters(){
  if(filtersReady) return; filtersReady = true;
  const opt = (v,l,sel) => `<option value="${esc(v)}"${sel?' selected':''}>${esc(l)}</option>`;
  const dep = PEOPLE.filter(p=>p.kind==='dep'), sen = PEOPLE.filter(p=>p.kind==='sen').sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
  const pname = p => p.prenom+' '+(p.kind==='sen'?p.nom.toLowerCase().replace(/(^|[ -])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()):p.nom)+(hasSource(p)?'':' (non collecté)');
  const aut = PEOPLE.filter(p=>p.kind==='autre');
  $('vPers').innerHTML = opt('','Tous les parlementaires')+`<optgroup label="Députés">${dep.map(p=>opt(p.id,pname(p))).join('')}</optgroup><optgroup label="Sénateurs">${sen.map(p=>opt(p.id,pname(p))).join('')}</optgroup>`
    + (aut.length ? `<optgroup label="Autres comptes de la liste">${aut.map(p=>opt(p.id,p.prenom)).join('')}</optgroup>` : '');
  const g = k => [...new Map(PEOPLE.filter(p=>p.kind===k).map(p=>[p.gkey,p.groupe])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'fr'));
  $('vGrp').innerHTML = opt('','Tous les groupes')+`<optgroup label="Assemblée nationale">${g('dep').map(([k,l])=>opt(k,l)).join('')}</optgroup><optgroup label="Sénat">${g('sen').map(([k,l])=>opt(k,l)).join('')}</optgroup>`+(PEOPLE.some(p=>p.kind==='autre')?opt('NR','Non rattaché'):'');
  $('vCirc').innerHTML = opt('','Toutes les circonscriptions')+Array.from({length:11},(_,i)=>opt(i+1, OBS.ORD(i+1)+' circ. · '+OBS.LEG[i+1])).join('');
  const nets = PORDER.filter(r=>ACCS.some(a=>a.reseau===r) || MAN.some(m=>m.reseau===r));
  $('vNet').innerHTML = opt('','Tous les réseaux collectés')+nets.map(r=>opt(r,PLATFORMS[r].label)).join('')+PORDER.filter(r=>!nets.includes(r)).map(r=>`<option disabled>${esc(PLATFORMS[r].label)} (non collecté)</option>`).join('');
  $('vNet').options[0].textContent = 'Tous les réseaux disponibles';
  $('vTheme').innerHTML = opt('','Tous les thèmes')+THEMES.map(t=>opt(t.id,t.label)).join('')+opt(THEME_OTHER.id,THEME_OTHER.label);
  const map = {vQ:'q',vRole:'role',vPers:'pid',vGrp:'grp',vCirc:'circ',vNet:'net',vPer:'per',vTheme:'theme',vType:'type'};
  Object.entries(map).forEach(([id,k])=>$(id).addEventListener(id==='vQ'?'input':'change',()=>{
    F[k] = $(id).value;
    SHOWN = 30; renderFeed();
  }));
  $('vReset').addEventListener('click',()=>{ Object.keys(F).forEach(k=>F[k]=''); Object.keys(map).forEach(id=>$(id).value=''); SHOWN=30; renderFeed(); });
  $('vRefresh').addEventListener('click',()=>{ syncAll(true); });
  $('vMore').addEventListener('click', async ()=>{
    const all = filtered();
    if(all.length > SHOWN){ SHOWN += 30; renderFeed(); return; }
    $('vMore').disabled = true; $('vMore').textContent = 'Chargement…';
    await loadOlder(); SHOWN += 30; renderFeed();
  });
  const v = $('v-veille');
  v.addEventListener('click',e=>{
    const l = e.target.closest('.vload'); if(l){ loadFrame(l); return; }
    const t = e.target.closest('.vtheme'); if(t){ F.theme = t.dataset.theme; $('vTheme').value = F.theme; SHOWN=30; renderFeed(); $('vTools').scrollIntoView({behavior:'smooth',block:'start'}); return; }
    const w = e.target.closest('[data-k="veille"]'); if(w){ OBS.openFiche('veille', w.dataset.i); return; }
    const g = e.target.closest('[data-go]'); if(g) OBS.showTab(g.dataset.go);
  });
}
function setFilters(o){ Object.assign(F, o); ['q','role','pid','grp','circ','net','per','theme','type'].forEach(k=>{ const id={q:'vQ',role:'vRole',pid:'vPers',grp:'vGrp',circ:'vCirc',net:'vNet',per:'vPer',theme:'vTheme',type:'vType'}[k]; if($(id)) $(id).value=F[k]; }); SHOWN=30; }
function renderFeed(){
  initFilters(); paintStatus();
  const all = filtered(), list = all.slice(0, SHOWN), h = horizon();
  const loading = ACCS.some(a=>ST[a.key].state==='en cours') && !POSTS.size;
  const sel = F.pid && BYID[F.pid];
  let note = '';
  const noAcc = !ACCS.some(accMatches) && !MAN.some(accMatches);
  if(sel && !hasSource(sel)) note = `<div class="glass notes">Aucun compte de ${personName(sel)} n'est collecté automatiquement. ${chipsHTML(sel)}</div>`;
  else if(noAcc) note = `<div class="glass notes">Aucune source ne correspond à ces critères. Sources disponibles : ${ACCS.concat(MAN).map(a=>personName(BYID[a.pid])+' ('+esc(PLATFORMS[a.reseau].label)+(a.manual?', sélection manuelle':'')+')').join(', ')||'aucune'}. Les autres comptes sont consultables depuis l'onglet « Parlementaires et comptes ».</div>`;
  else if(F.circ && F.role!=='dep' && !F.pid) note = `<div class="small vnote">Le filtre par circonscription ne retient que des députés : les sénateurs représentent l'ensemble des Français établis hors de France.</div>`;
  $('vCount').textContent = loading ? 'Chargement des publications…' : `${plural(all.length,'publication')}${h>-Infinity?` depuis le ${fmtD(h)} (plus anciennes : « Charger plus »)`:''}`;
  $('vFeed').innerHTML = note + (list.length ? list.map(p=>postHTML(p)).join('')
    : loading ? '<div class="glass notes">Chargement des publications en cours…</div>'
    : ((!sel || hasSource(sel)) && !noAcc) ? (!POSTS.size && ACCS.length && ACCS.every(a=>ST[a.key].state==='erreur')
        ? '<div class="glass notes">Les sources sont momentanément indisponibles : aucune publication ne peut être affichée. Réessayez plus tard avec « Actualiser ».</div>'
        : '<div class="glass notes">Aucune publication ne correspond à ces critères parmi les publications chargées.</div>') : '');
  const more = all.length > SHOWN || hasMore();
  const btn = $('vMore'); btn.hidden = !more || loading; btn.disabled = false; btn.textContent = all.length > SHOWN ? 'Afficher plus' : 'Charger des publications plus anciennes';
}

// --- Vue « Parlementaires et comptes » ---
let dirReady = false;
function renderDirectory(){
  if(!dirReady){
    dirReady = true;
    ['vdQ','vdRole'].forEach(id=>$(id).addEventListener(id==='vdQ'?'input':'change', renderDirectory));
    $('vDir').addEventListener('click',e=>{ if(e.target.closest('a')) return; const c=e.target.closest('[data-k]'); if(c) OBS.openFiche('veille', c.dataset.i); });
    $('vDir').addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-k][role=button]')){ e.preventDefault(); OBS.openFiche('veille', e.target.dataset.i); } });
  }
  const q = nrm($('vdQ').value).trim(), r = $('vdRole').value;
  const L = PEOPLE.filter(p=>(!r||p.kind===r) && (!q || q.split(/\s+/).every(w=>nrm([p.prenom,p.nom,p.groupe,p.place,p.role,p.accounts.map(a=>a.identifiant+' '+a.reseau).join(' ')].join(' ')).includes(w))));
  $('vdCount').textContent = `${L.length} sur ${PEOPLE.length}`;
  $('vDir').innerHTML = L.map(p=>{
    const n = [...POSTS.values()].filter(x=>x.pid===p.id).length;
    return `<div class="glass depcard vcard" role="button" tabindex="0" data-k="veille" data-i="${esc(p.id)}">
      <div class="dep-top">${p.photo('dep-photo')}<div class="dep-id"><div class="dep-circ">${esc(p.role)} · ${esc(p.chamber)}</div><h4>${personName(p)}</h4><div class="small">${esc(p.place)}</div></div></div>
      <div class="small"><span class="sw" style="background:${esc(p.col)}"></span>${esc(p.groupe)}</div>
      ${chipsHTML(p)}
      <div class="small dep-last">${isCollected(p) ? (n?`${plural(n,'publication chargée','publications chargées')}`:'Collecte automatique active') : n ? `${plural(n,'publication sélectionnée','publications sélectionnées')} manuellement` : 'Aucun compte collecté automatiquement'}</div>
    </div>`;
  }).join('') || '<div class="glass notes">Aucun parlementaire ne correspond à cette recherche.</div>';
}

// Fiche individuelle : le tableau de diagnostic n'est pas publié.
function ficheHTML(id){
  const P = BYID[id]; if(!P) return '';
  return `<div class="depcard big vfiche" data-vid="${esc(id)}">
    <div class="dep-top">${P.photo('dep-photo')}<div class="dep-id"><div class="dep-circ">${esc(P.role)} · ${esc(P.chamber)}</div><h4 id="ficheTitle">${personName(P)}</h4><div class="small">${esc(P.place)}</div></div></div>
    <dl class="dep-dl"><dt>Groupe politique</dt><dd><span class="sw" style="background:${esc(P.col)}"></span>${esc(P.groupe)}</dd></dl>
    <a class="dep-link" href="${esc(P.fiche)}" target="_blank" rel="noopener">${esc(P.ficheLabel)} ↗</a>
    <div class="fiche-sec"><div class="restitle">Comptes publics vérifiés</div>${chipsHTML(P)}</div>
    <div id="vFicheBody">${ficheBody(P)}</div>
  </div>`;
}
function ficheBody(P){
  if(!hasSource(P)) return `<div class="fiche-sec small">Aucun compte de ce parlementaire n'est collecté automatiquement. Les publications restent consultables via les liens ci-dessus.</div>`;
  const st = ACCS.filter(a=>a.pid===P.id).map(a=>ST[a.key]);
  const posts = [...POSTS.values()].filter(p=>p.pid===P.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(st.some(s=>s.state==='en cours'||s.state==='attente') && !posts.length) return '<div class="fiche-sec small">Chargement des publications…</div>';
  if(!posts.length) return `<div class="fiche-sec small">${st.some(s=>s.state==='erreur')?'Source indisponible : '+esc(st.find(s=>s.err).err)+'.':'Aucune publication récupérée.'}</div>`;
  const own = posts.filter(p=>p.type!=='repost' && p.themes.length);
  const nRep = posts.filter(p=>p.type==='repost').length, nMan = posts.filter(p=>p.manual).length;
  const cnt = {}; own.forEach(p=>p.themes.forEach(t=>cnt[t]=(cnt[t]||0)+1));
  const th = Object.entries(cnt).sort((a,b)=>b[1]-a[1]); const max = th.length ? th[0][1] : 1;
  // chronologie : publications par semaine sur les 12 dernières semaines
  const wk = Array(12).fill(0), now = Date.now();
  posts.forEach(p=>{ const i = Math.floor((now - new Date(p.date))/(7*864e5)); if(i>=0 && i<12) wk[11-i]++; });
  const wmax = Math.max(1,...wk), first = new Date(posts[posts.length-1].date);
  const parts = [nRep&&plural(nRep,'republication'), nMan&&`${nMan} en sélection manuelle`].filter(Boolean);
  const span = `${plural(posts.length,'publication','publications')}${parts.length?' (dont '+parts.join(', ')+')':''}, du ${fmtD(first)} au ${fmtD(posts[0].date)}`;
  return `<div class="fiche-sec"><div class="restitle">Thèmes principalement abordés</div>
      ${own.length ? `<div class="small" style="margin-bottom:6px">Sur ${plural(own.length,'message personnel','messages personnels')} dont le texte est disponible · détection automatique par mots-clés, sans interprétation des positions.</div>
      ${th.slice(0,8).map(([t,n])=>`<div class="vbar"><span>${esc(themeLabel(t))}</span><div class="resbar"><div style="width:${(n/max*100).toFixed(1)}%;background:#5f86ad"></div></div><b>${n}</b></div>`).join('')}`
      : '<div class="small">Non déterminés : le texte des publications disponibles n\'est pas accessible.</div>'}</div>
    <div class="fiche-sec"><div class="restitle">Chronologie · 12 dernières semaines</div>
      <div class="vweeks" role="img" aria-label="Nombre de publications chargées par semaine sur les 12 dernières semaines : ${wk.join(', ')}">${wk.map((n,i)=>`<span title="${n} publication(s), semaine ${i-11===0?'en cours':'S'+(i-11)}"><i style="height:${(n/wmax*100).toFixed(0)}%"></i></span>`).join('')}</div>
      <div class="small">${esc(span)}.${ACCS.some(a=>a.pid===P.id&&!ST[a.key].done)?' Seules les publications les plus récentes sont chargées.':''}</div></div>
    <div class="fiche-sec"><div class="restitle">Dernières publications</div><div class="vmini">${posts.slice(0,6).map(p=>postHTML(p,true)).join('')}</div>
      <button type="button" class="lnk" data-vfeed="${esc(P.id)}" style="margin-top:8px">Voir toutes ses publications dans le fil</button></div>`;
}
async function ficheMounted(id){
  try{ history.replaceState(null,'','#veille/'+encodeURIComponent(id)); }catch(e){}
  const body = document.getElementById('ficheBody');
  if(body && !body.dataset.vbound){
    body.dataset.vbound = '1';
    body.addEventListener('click',e=>{
      const l = e.target.closest('.vload'); if(l){ loadFrame(l); return; }
      const b = e.target.closest('[data-vfeed]'); if(b){ OBS.closeFiche(); setFilters({q:'',role:'',grp:'',circ:'',net:'',per:'',theme:'',type:'',pid:b.dataset.vfeed}); OBS.showTab('veille'); return; }
      const t = e.target.closest('.vtheme'); if(t){ const v=document.querySelector('.vfiche'); OBS.closeFiche(); setFilters({q:'',role:'',grp:'',circ:'',net:'',per:'',type:'',pid:v?v.dataset.vid:'',theme:t.dataset.theme}); OBS.showTab('veille'); }
    });
  }
  const P = BYID[id]; if(!P || !isCollected(P)) return;
  await READY; await syncOne(id);
  const cur = document.querySelector('.vfiche'); if(cur && cur.dataset.vid===id && $('vFicheBody')) $('vFicheBody').innerHTML = ficheBody(P);
}

// --- Bloc « Réseaux sociaux » dans les fiches Députés / Sénateurs existantes ---
function socialBlock(id){
  const P = BYID[id]; if(!P) return '';
  return `<div class="fiche-sec"><div class="restitle">Réseaux sociaux</div>${chipsHTML(P)}<button type="button" class="lnk" data-open="veille" data-id="${esc(id)}" style="margin-top:8px">Veille parlementaire : publications et thèmes</button></div>`;
}

// ---------- Bandeau d'en-tête ----------
function hero(v){
  const t = {veille:"Réseaux sociaux", 'veille-comptes':"Parlementaires et comptes"}[v];
  const p = {veille:"Dernières publications publiques des 11 députés et 12 sénateurs des Français établis hors de France, dans un fil commun. Seuls les réseaux accessibles gratuitement et légalement sont collectés : le fil n'est pas exhaustif.",
    'veille-comptes':"Comptes publics des 23 parlementaires, relevés sur les fiches officielles de l'Assemblée nationale et du Sénat. Un compte non confirmé n'est pas affiché."}[v];
  if(!REG) return {t, p, k:[]};
  const nAcc = PEOPLE.reduce((n,x)=>n+x.accounts.length,0);
  const nets = new Set(ACCS.map(a=>a.reseau)).size;
  return {t, p, k:[[String(PEOPLE.length),"parlementaires suivis"],[String(nAcc),"comptes publics vérifiés"],[String(ACCS.length),"collecté(s) automatiquement"],[`${nets} / ${PORDER.length}`,"réseaux collectés"],[String(POSTS.size),"publications chargées"]]};
}

function refresh(){
  if(!REG) return;
  OBS.refreshHero && OBS.refreshHero();
  if(CUR_VIEW==='veille' && !$('v-veille').hidden) renderFeed();
  else if(CUR_VIEW==='veille-comptes' && !$('v-veille-comptes').hidden) renderDirectory();
  paintStatus();
  const f = document.querySelector('.vfiche'); if(f && $('vFicheBody') && BYID[f.dataset.vid]) $('vFicheBody').innerHTML = ficheBody(BYID[f.dataset.vid]);
}

// =====================================================================
// API publique du module (appelée par app.js)
// =====================================================================
window.VEILLE = {
  init(obs){
    OBS = obs;
    READY = (async()=>{
      const get = async u => { const r = await fetch(u); if(!r.ok) throw new Error(u+' introuvable'); return r.json(); };
      const [reg, th] = await Promise.all([get('./data/veille/comptes.json'), get('./data/veille/themes.json')]);
      try{ CFG = await get('./data/veille/config.json'); }catch(e){ CFG = {}; }      // facultatif
      REG = reg; compileThemes(th);
      await prepareBluesky(); buildPeople(); await prepareInstagram();
      let sel = null; try{ sel = await get('./data/veille/selection.json'); }catch(e){}   // facultatif
      loadSelection(sel);
    })().catch(e=>{ console.error('Veille parlementaire :', e); REG = null; throw e; });
    READY.catch(()=>{});
    return READY;
  },
  async render(v){
    CUR_VIEW = v;
    const target = {veille:'vFeed','veille-comptes':'vDir'}[v];
    if(!target)return;
    try{ await READY; }catch(e){ $(target).innerHTML = '<div class="glass notes">Les fichiers data/veille/comptes.json et data/veille/themes.json sont introuvables.</div>'; return; }
    if(v==='veille') renderFeed(); else renderDirectory();
    OBS.refreshHero && OBS.refreshHero();
    if(!FETCHED_AT && !LOADING) syncAll(false);
    else if(FETCHED_AT && Date.now()-FETCHED_AT > CACHE_TTL) syncAll(true);
  },
  hero, socialBlock,
  fiche(id){ return REG ? ficheHTML(id) : ''; },
  ficheMounted,
  has(id){ return !!BYID[id]; },
  // exposé pour les tests automatisés (aucune écriture possible vers une source)
  _test:{classify, compileThemes, richText, bskyPost, nrm, MANUAL}
};
})();
