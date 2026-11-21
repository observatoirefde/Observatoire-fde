// =====================================================================
// Bluesky (AT Protocol) : fonctions partagées entre le site (veille.js)
// et le collecteur automatique (collecteur/bluesky-liste.mjs).
// Aucune dépendance ; fonctionne dans un navigateur et dans Node.js.
// =====================================================================
(function(root){
'use strict';

const API = 'https://public.api.bsky.app/xrpc/';

// Lien de liste Bluesky → AT-URI.
// Accepte https://bsky.app/profile/<did ou pseudo>/lists/<clé> ou directement at://…
function listUrlToUri(input){
  const s = String(input||'').trim();
  let m = /^at:\/\/(did:[a-z0-9]+:[A-Za-z0-9._:%-]+|[A-Za-z0-9.-]+)\/app\.bsky\.graph\.list\/([A-Za-z0-9._~:-]+)$/.exec(s);
  if(!m){
    let u; try{ u = new URL(s); }catch(e){ throw new Error('Lien de liste illisible : '+s); }
    if(!/(^|\.)bsky\.app$/.test(u.hostname)) throw new Error("Le lien de liste doit être sur bsky.app : "+s);
    m = /^\/profile\/([^\/]+)\/lists\/([A-Za-z0-9._~:-]+)\/?$/.exec(decodeURIComponent(u.pathname));
    if(!m) throw new Error("Ce lien n'est pas celui d'une liste Bluesky (…/profile/…/lists/…) : "+s);
  }
  const repo = m[1], rkey = m[2];
  return {repo, rkey, isDid:/^did:/.test(repo), uri:/^did:/.test(repo) ? `at://${repo}/app.bsky.graph.list/${rkey}` : null};
}

const postUrl = (author, uri) => `https://bsky.app/profile/${encodeURIComponent(author.handle||author.did)}/post/${encodeURIComponent(String(uri).split('/').pop())}`;
function quote(r){
  if(!r) return null;
  if(r.$type==='app.bsky.embed.record#viewRecord') return {name:r.author.displayName||r.author.handle, handle:r.author.handle, text:(r.value&&r.value.text)||'', url:postUrl(r.author,r.uri), date:r.value&&r.value.createdAt};
  if(/#view(NotFound|Blocked|Detached)$/.test(r.$type||'')) return {missing:true};
  return null; // fils, listes : non affichés
}
function embed(e){
  if(!e) return null;
  switch(e.$type){
    case 'app.bsky.embed.images#view': return {images:(e.images||[]).map(i=>({thumb:i.thumb, full:i.fullsize, alt:i.alt||'', ar:i.aspectRatio}))};
    case 'app.bsky.embed.video#view': return {video:{thumb:e.thumbnail, alt:e.alt||''}};
    case 'app.bsky.embed.external#view': return {link:{uri:e.external.uri, title:e.external.title||'', desc:e.external.description||'', thumb:e.external.thumb}};
    case 'app.bsky.embed.record#view': return {quote:quote(e.record)};
    case 'app.bsky.embed.recordWithMedia#view': return Object.assign({}, embed(e.media), {quote:quote(e.record&&e.record.record)});
  }
  return null;
}

// Compte à l'origine d'un élément de fil : celui qui republie pour un repost,
// l'auteur sinon. Sert à vérifier que l'élément provient bien d'un compte suivi.
function actorOf(it){
  const r = it && it.reason;
  if(r && r.$type==='app.bsky.feed.defs#reasonRepost') return r.by && r.by.did || null;
  return it && it.post && it.post.author && it.post.author.did || null;
}

// Élément de fil (getAuthorFeed, getListFeed) → publication au format commun.
// actorDid : compte suivi qui publie ou republie. Renvoie null pour une publication épinglée.
function toPost(it, actorDid){
  const p = it.post, rec = p.record||{}, reason = it.reason;
  if(reason && reason.$type==='app.bsky.feed.defs#reasonPin') return null;
  const repost = !!(reason && reason.$type==='app.bsky.feed.defs#reasonRepost');
  const emb = embed(p.embed);
  const type = repost ? 'repost' : rec.reply ? 'reply' : (emb&&emb.quote&&!emb.quote.missing) ? 'quote' : 'original';
  let date = repost ? reason.indexedAt : (rec.createdAt||p.indexedAt);
  if(!repost && p.indexedAt && new Date(date) > new Date(p.indexedAt)) date = p.indexedAt; // date antidatée dans le futur
  const par = it.reply && it.reply.parent && it.reply.parent.author;
  return {
    id: 'bluesky:'+(repost ? 'rp:'+actorDid+':' : '')+p.uri, platform:'bluesky',
    did: actorDid, uri: p.uri, cid: p.cid, auteur_did: p.author.did,
    url: postUrl(p.author, p.uri), date, type, indexe: repost ? reason.indexedAt : (p.indexedAt||date),   // indexe : ordre du fil
    text: rec.text||'', facets: rec.facets||[],
    author: repost ? {name:p.author.displayName||p.author.handle, handle:p.author.handle, url:'https://bsky.app/profile/'+encodeURIComponent(p.author.handle)} : null,
    replyTo: rec.reply ? (par ? {name:par.displayName||par.handle, handle:par.handle} : {}) : null,
    embed: emb, labels:(p.labels||[]).map(l=>l.val)
  };
}

const api = {API, listUrlToUri, postUrl, embed, quote, actorOf, toPost};
if(typeof module!=='undefined' && module.exports) module.exports = api;
root.VeilleBluesky = api;
})(typeof window!=='undefined' ? window : globalThis);
