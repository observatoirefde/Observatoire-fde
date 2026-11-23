// Rubrique « Veille » → sous-onglet « Veille institutionnelle » (route #institutionnel).
// Étape 1 : Journal officiel et bibliothèque documentaire, avec une recherche commune aux modules.
// Chargé à la demande par app.js (aucune modification d'index.html pour la vue).
// Données : data/institutionnel/jo.json, bibliotheque.json, etat.json (workflow « Veille institutionnelle »).
(function(){
  'use strict';
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dateFr = s => { const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s||''); if(!m) return s||'—'; return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][+m[2]-1]+' '+m[1]; };
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,"'");
  const NATURES = {LOI:'Loi', LOI_ORGANIQUE:'Loi organique', DECRET:'Décret', ARRETE:'Arrêté', ORDONNANCE:'Ordonnance', DECISION:'Décision', AVIS:'Avis', CIRCULAIRE:'Circulaire', INSTRUCTION:'Instruction', DELIBERATION:'Délibération', RAPPORT:'Rapport'};
  const nature = n => NATURES[n] || (n ? n.charAt(0)+n.slice(1).toLowerCase().replace(/_/g,' ') : 'Texte');
  const PAS = 30;
  let JO=null, BIB=null, ETAT=null, ROOT=null, onData=null, MODULE='jo', VUS={jo:PAS, bib:PAS};
  const $ = id => document.getElementById(id);
  const charger = f => fetch('./data/institutionnel/'+f, {cache:'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null);

  function squelette(el){
    el.insertAdjacentHTML('beforeend', `
    <section class="first vi">
      <div class="sec-head"><div><h3>Textes et documents</h3>
        <p class="hint">Une recherche commune parcourt le Journal officiel et la bibliothèque documentaire ; chaque module dispose de ses propres filtres.</p></div>
        <span class="small" id="viMaj"></span></div>
      <div class="glass rtools vi-search">
        <label class="rsearch"><span class="sr">Rechercher dans tous les modules</span><input id="viQ" type="search" placeholder="Rechercher dans le Journal officiel et la bibliothèque : bourses, AEFE, état civil…" autocomplete="off"></label>
        <div class="seg" id="viMod" role="tablist" aria-label="Modules"><button type="button" data-m="jo" class="on" role="tab">Journal officiel <span id="viNjo"></span></button><button type="button" data-m="bib" role="tab">Bibliothèque documentaire <span id="viNbib"></span></button></div>
      </div>
      <div id="viRes"></div>
      <div id="viJO">
        <div class="glass rtools">
          <select id="viJoPert" aria-label="Pertinence"><option value="forte">Textes visant les Français de l'étranger</option><option value="">Tous les textes retenus (dont textes du MEAE)</option></select>
          <select id="viJoNat" aria-label="Nature du texte"><option value="">Toutes les natures</option></select>
          <select id="viJoTh" aria-label="Thème"><option value="">Tous les thèmes</option></select>
          <select id="viJoAn" aria-label="Année"><option value="">Toutes les années</option></select>
        </div>
        <div class="vi-list" id="viJoList"></div>
        <div class="more-row"><button type="button" class="lnk" id="viJoMore" hidden></button></div>
        <p class="hint" id="viJoSrc"></p>
      </div>
      <div id="viBIB" hidden>
        <div class="glass rtools">
          <select id="viBiInst" aria-label="Institution"><option value="">Toutes les institutions</option></select>
          <select id="viBiType" aria-label="Type de document"><option value="">Tous les types</option></select>
          <select id="viBiTh" aria-label="Thème"><option value="">Tous les thèmes</option></select>
          <select id="viBiAn" aria-label="Année"><option value="">Toutes les années</option></select>
        </div>
        <div class="vi-list" id="viBiList"></div>
        <div class="more-row"><button type="button" class="lnk" id="viBiMore" hidden></button></div>
        <p class="hint" id="viBiSrc"></p>
      </div>
      <div class="glass notes vi-notes"><ul>
        <li><b>Journal officiel :</b> données ouvertes de la DILA, lues chaque jour depuis le 1er septembre 2026. Un texte est retenu si son titre vise les Français de l'étranger (élections et représentation, administration consulaire, enseignement français à l'étranger, protection sociale, fiscalité des non-résidents…) ou s'il émane du ministère de l'Europe et des affaires étrangères, hors mesures individuelles (nominations, carrières). Le classement par thème est automatique et indicatif.</li>
        <li><b>Bibliothèque :</b> rapports et avis du Sénat (flux officiels), documents publiés par l'Assemblée des Français de l'étranger (rapports et auditions des commissions, résolutions, réponses de l'administration, ordres du jour) et sélection éditoriale (Cour des comptes, MEAE, AEFE, CFE…). Pour l'AFE, la date indiquée est celle de la mise en ligne. Les propositions de loi figurent dans « Activité législative ».</li>
        <li><b>À venir :</b> agenda institutionnel (avec export de calendrier) et suivi des travaux de l'AFE (rapprochement des résolutions et des réponses de l'administration).</li>
      </ul></div>
    </section>`);
    $('viMod').addEventListener('click', e => { const b=e.target.closest('button'); if(b) choisir(b.dataset.m); });
    ['viJoPert','viJoNat','viJoTh','viJoAn'].forEach(id => $(id).addEventListener('change', () => { VUS.jo=PAS; rendreJO(); }));
    ['viBiInst','viBiType','viBiTh','viBiAn'].forEach(id => $(id).addEventListener('change', () => { VUS.bib=PAS; rendreBib(); }));
    $('viJoMore').addEventListener('click', () => { VUS.jo+=PAS; rendreJO(); });
    $('viBiMore').addEventListener('click', () => { VUS.bib+=PAS; rendreBib(); });
    let t=0; $('viQ').addEventListener('input', () => { clearTimeout(t); t=setTimeout(() => { VUS.jo=VUS.bib=PAS; rendreTout(); }, 120); });
  }

  function choisir(m){
    MODULE=m;
    document.querySelectorAll('#viMod button').forEach(b => { b.classList.toggle('on', b.dataset.m===m); b.setAttribute('aria-selected', String(b.dataset.m===m)); });
    $('viJO').hidden = m!=='jo'; $('viBIB').hidden = m!=='bib';
  }

  const options = (id, valeurs, lib=v=>v) => $(id).insertAdjacentHTML('beforeend', valeurs.map(v => `<option value="${esc(v)}">${esc(lib(v))}</option>`).join(''));
  const uniques = (l, f) => [...new Set(l.flatMap(f).filter(Boolean))];

  function remplir(){
    const T = (JO && JO.textes) || [], D = (BIB && BIB.documents) || [];
    options('viJoNat', uniques(T, t => [t.nature]).sort((a,b) => nature(a).localeCompare(nature(b),'fr')), nature);
    options('viJoTh', uniques(T, t => t.themes).sort((a,b) => a.localeCompare(b,'fr')));
    options('viJoAn', uniques(T, t => [(t.date_publication||'').slice(0,4)]).sort().reverse());
    options('viBiInst', uniques(D, d => [d.institution]).sort((a,b) => a.localeCompare(b,'fr')));
    options('viBiType', uniques(D, d => [d.type]).sort((a,b) => a.localeCompare(b,'fr')));
    options('viBiTh', uniques(D, d => d.themes).sort((a,b) => a.localeCompare(b,'fr')));
    options('viBiAn', uniques(D, d => [d.annee]).sort().reverse());
    const m = ETAT && ETAT.modules || {};
    const src = (mod, nom, url) => { const e=m[mod]; return `Source : ${url}. ` + (e ? `Dernière vérification : ${dateFr(e.derniere_verification||e.derniere_tentative)}.` + (e.statut==='erreur' ? ` <span class="vi-err">Dernière collecte en échec (${esc(e.erreur)}) : données du ${dateFr(e.derniere_verification)} affichées.</span>` : '') : ''); };
    $('viJoSrc').innerHTML = src('jo', 'Journal officiel', '<a href="https://echanges.dila.gouv.fr/OPENDATA/JORF/" target="_blank" rel="noopener">données ouvertes de la DILA</a>, liens vers Légifrance');
    $('viBiSrc').innerHTML = src('bibliotheque', 'Bibliothèque', 'Sénat (flux RSS), <a href="https://www.assemblee-afe.fr/" target="_blank" rel="noopener">Assemblée des Français de l\'étranger</a>, sélection éditoriale');
    const dates = Object.values(m).map(e => e.derniere_verification).filter(Boolean).sort();
    $('viMaj').textContent = dates.length ? 'Actualisé le ' + dateFr(dates[dates.length-1]) : '';
    rendreTout();
  }

  // recherche commune : tous les mots doivent figurer dans le titre, l'institution, la nature, les thèmes ou le résumé
  const mots = () => norm($('viQ').value.trim()).split(/\s+/).filter(Boolean);
  const cherche = (q, champs) => { if(!q.length) return true; const t=norm(champs.join(' ')); return q.every(w => t.includes(w)); };
  const filtreJO = q => ((JO && JO.textes) || []).filter(t => cherche(q, [t.titre, nature(t.nature), t.ministere, t.nor, (t.themes||[]).join(' ')]));
  const filtreBib = q => ((BIB && BIB.documents) || []).filter(d => cherche(q, [d.titre, d.institution, d.type, d.session, d.commission, d.resume, (d.themes||[]).join(' ')]));

  function rendreTout(){
    const q = mots(), nj = filtreJO(q), nb = filtreBib(q);
    $('viNjo').textContent = `(${q.length ? nj.length : nj.filter(t => t.pertinence==='forte').length})`;
    $('viNbib').textContent = `(${nb.length})`;
    $('viRes').innerHTML = q.length ? `<div class="vi-resume">${nj.length+nb.length ? `<b>${nj.length+nb.length}</b> résultat${nj.length+nb.length>1?'s':''} : ${nj.length} au Journal officiel, ${nb.length} dans la bibliothèque.` : 'Aucun résultat dans les modules.'}</div>` : '';
    if(q.length && MODULE==='jo' && !nj.length && nb.length) choisir('bib');
    else if(q.length && MODULE==='bib' && !nb.length && nj.length) choisir('jo');
    rendreJO(); rendreBib();
  }

  const chips = l => (l||[]).filter(t => t!=='Autres').map(t => `<span class="vi-chip">${esc(t)}</span>`).join('');
  function plus(btn, n, vus){ const b=$(btn); b.hidden = n<=vus; b.textContent = `Afficher plus (${n-vus} restant${n-vus>1?'s':''})`; }

  function rendreJO(){
    const q = mots(), p=$('viJoPert').value, n=$('viJoNat').value, th=$('viJoTh').value, an=$('viJoAn').value;
    const L = filtreJO(q).filter(t => (!p || q.length || t.pertinence===p) && (!n || t.nature===n) && (!th || (t.themes||[]).includes(th)) && (!an || (t.date_publication||'').startsWith(an)));
    $('viJoList').innerHTML = !JO ? '<div class="vi-empty">Les données du Journal officiel ne sont pas encore disponibles.</div>'
      : !L.length ? '<div class="vi-empty">Aucun texte ne correspond à ces critères.</div>'
      : L.slice(0, VUS.jo).map(t => `<article class="glass vi-item">
          <div class="vi-meta"><span class="vi-date">${dateFr(t.date_publication)}</span><span class="vi-pill">${esc(nature(t.nature))}</span>${t.pertinence==='moyenne' ? '<span class="vi-pill vi-pill-l">Texte du MEAE</span>' : ''}</div>
          <h4><a href="${esc(t.source)}" target="_blank" rel="noopener">${esc(t.titre)}</a></h4>
          <div class="vi-sub">${esc(t.ministere||'')}${t.publication ? ' · '+esc(t.publication) : ''}${t.nor ? ' · NOR '+esc(t.nor) : ''}</div>
          ${chips(t.themes) ? `<div class="vi-chips">${chips(t.themes)}</div>` : ''}
        </article>`).join('');
    plus('viJoMore', L.length, VUS.jo);
  }

  function rendreBib(){
    const q = mots(), i=$('viBiInst').value, ty=$('viBiType').value, th=$('viBiTh').value, an=$('viBiAn').value;
    const L = filtreBib(q).filter(d => (!i || d.institution===i) && (!ty || d.type===ty) && (!th || (d.themes||[]).includes(th)) && (!an || d.annee===an));
    $('viBiList').innerHTML = !BIB ? '<div class="vi-empty">La bibliothèque n\'est pas encore disponible.</div>'
      : !L.length ? '<div class="vi-empty">Aucun document ne correspond à ces critères.</div>'
      : L.slice(0, VUS.bib).map(d => `<article class="glass vi-item">
          <div class="vi-meta"><span class="vi-date">${dateFr(d.date)}</span><span class="vi-pill">${esc(d.institution)}</span><span class="vi-pill vi-pill-l">${esc(d.type)}</span></div>
          <h4><a href="${esc(d.source)}" target="_blank" rel="noopener">${esc(d.titre)}</a></h4>
          <div class="vi-sub">${[d.session, d.commission, d.origine].filter(Boolean).map(esc).join(' · ')}</div>
          ${d.resume ? `<p class="vi-resume-doc">${esc(d.resume)}</p>` : ''}
          ${chips(d.themes) ? `<div class="vi-chips">${chips(d.themes)}</div>` : ''}
        </article>`).join('');
    plus('viBiMore', L.length, VUS.bib);
  }

  function kpis(){
    if(!JO && !BIB) return [];
    const T=(JO&&JO.textes)||[], k=[];
    if(JO) k.push([String(T.filter(t => t.pertinence==='forte').length), 'textes du JO visant les Français de l\'étranger']);
    if(BIB) k.push([String(BIB.documents.length), 'documents dans la bibliothèque']);
    const dates = Object.values((ETAT&&ETAT.modules)||{}).map(e => e.derniere_verification).filter(Boolean).sort();
    if(dates.length) k.push([dateFr(dates[dates.length-1]), 'dernière actualisation']);
    return k;
  }

  window.INSTITUTIONNEL = {
    kpis,
    render(el, cb){
      if(cb) onData = cb;
      if(ROOT===el) return;
      ROOT = el; squelette(el);
      Promise.all([charger('jo.json'), charger('bibliotheque.json'), charger('etat.json')]).then(v => {
        [JO, BIB, ETAT] = v; remplir(); if(onData) onData();
      });
    }
  };
})();
