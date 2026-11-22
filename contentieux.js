// Rubrique « Élections » → sous-rubrique « Contentieux électoral » (route #contentieux).
// Recours contre les élections de 2026 des conseillers des Français de l'étranger (CFDE)
// et des conseillers à l'AFE. Chargé à la demande par app.js (aucune modification d'index.html).
// Données : data/contentieux/recours.json (inventaire éditorial vérifié, seul compté),
//           data/contentieux/detections.json (veille quotidienne du workflow « Veille contentieux »).
(function(){
  'use strict';
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dateFr = s => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s||'—'); };
  const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const moisFr = l => MOIS[+l.slice(4)-1]+' '+l.slice(0,4);
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const CLASSE = {'En cours':'ct-warn','Rejeté':'ct-ok','Annulation':'ct-bad','Réformation':'ct-bad','Désistement':'ct-neu','Non-lieu':'ct-neu'};
  let REC=null, DET=null, ROOT=null, PRET=null, onData=null;

  const charger = f => fetch('./data/contentieux/'+f, {cache:'no-cache'}).then(r => { if(!r.ok) throw new Error(f+' : HTTP '+r.status); return r.json(); });

  function squelette(el){
    el.insertAdjacentHTML('beforeend', `
    <section class="first ct">
      <div class="sec-head"><div><h3>Recours recensés</h3>
        <p class="hint">Recours dont l'existence est établie par une source officielle, vérifiés par l'Observatoire. Seuls ces recours sont comptés.</p></div>
        <span class="small" id="ctCount"></span></div>
      <div class="ct-avert" id="ctAvert"></div>
      <div class="glass rtools">
        <label class="rsearch"><span class="sr">Rechercher un recours</span><input id="ctQ" type="search" placeholder="Numéro, liste, grief…" autocomplete="off"></label>
        <select id="ctScrutin" aria-label="Scrutin"><option value="">Tous les scrutins</option><option value="CFDE">Conseillers des Français de l'étranger</option><option value="AFE">Conseillers à l'AFE</option></select>
        <select id="ctCirc" aria-label="Circonscription"><option value="">Toutes les circonscriptions</option></select>
        <select id="ctStatut" aria-label="Statut"><option value="">Tous les statuts</option></select>
        <button type="button" class="lnk" id="ctReset">Réinitialiser</button>
      </div>
      <div class="ct-list" id="ctRecours"></div>
    </section>
    <section class="ct">
      <div class="sec-head"><div><h3>Décisions repérées automatiquement, à vérifier</h3>
        <p class="hint">Décisions du Conseil d'État détectées par la veille quotidienne et non encore rattachées à un recours vérifié. Ce ne sont <b>pas</b> des recours confirmés : chacune est examinée avant d'être ajoutée ou écartée.</p></div></div>
      <div class="ct-list" id="ctDet"></div>
    </section>
    <section class="ct ct-cols">
      <div class="glass ct-box"><h4>État de la veille automatique</h4><div id="ctVeille"></div></div>
      <div class="glass notes ct-box"><h4>Méthode et limites</h4><ul>
        <li><b>Source :</b> archives mensuelles des décisions du Conseil d'État publiées en open data par la juridiction administrative, relues chaque jour depuis mai 2026 (des décisions sont ajoutées après coup aux archives anciennes).</li>
        <li><b>Détection :</b> une décision est retenue si une même phrase cite le scrutin (conseillers des Français de l'étranger, conseils ou délégués consulaires, Assemblée des Français de l'étranger) et un terme électoral (élection, protestation, scrutin…). Méthode testée sur les décisions relatives aux élections de 2021 : 17 décisions retrouvées, aucune décision étrangère au sujet retenue.</li>
        <li><b>Rapprochement :</b> par numéro de dossier du Conseil d'État (recours joints compris) ou par identifiant ECLI ; la circonscription est proposée à titre indicatif.</li>
        <li><b>Limites :</b> aucun registre public ne recense les affaires en cours ; elles ne figurent ici que si l'Observatoire en a connaissance par une source officielle. Une décision n'apparaît qu'après sa mise en ligne, avec un délai. Les décisions publiées sont pseudonymisées : aucune partie n'est nommée.</li>
      </ul></div>
    </section>`);
    ['ctScrutin','ctCirc','ctStatut'].forEach(id => document.getElementById(id).addEventListener('change', rendreRecours));
    document.getElementById('ctQ').addEventListener('input', rendreRecours);
    document.getElementById('ctReset').addEventListener('click', () => { ['ctScrutin','ctCirc','ctStatut','ctQ'].forEach(id => document.getElementById(id).value=''); rendreRecours(); });
  }

  const detPar = id => (DET && DET.decisions || []).filter(d => d.recours===id);

  function remplir(){
    const R = REC.recours || [];
    const circs = [...new Set(R.map(r => r.circonscription))].sort((a,b) => a.localeCompare(b,'fr'));
    document.getElementById('ctCirc').insertAdjacentHTML('beforeend', circs.map(c => `<option>${esc(c)}</option>`).join(''));
    document.getElementById('ctStatut').insertAdjacentHTML('beforeend', [...new Set(R.map(r => r.statut))].map(s => `<option>${esc(s)}</option>`).join(''));
    const inv = REC.inventaire || {};
    document.getElementById('ctAvert').innerHTML = '<b>Recensement non exhaustif.</b> ' + (inv.arrete_au
      ? `Inventaire des recours arrêté au ${dateFr(inv.arrete_au)}.`
      : "L'inventaire des recours déposés n'est pas encore arrêté : un recours en cours peut ne pas figurer ici tant qu'aucune décision n'a été publiée.");
    rendreRecours(); rendreDetections(); rendreVeille();
  }

  function rendreRecours(){
    const v = id => document.getElementById(id).value;
    const s=v('ctScrutin'), c=v('ctCirc'), t=v('ctStatut'), q=norm(v('ctQ').trim());
    const L = (REC.recours||[]).filter(r => (!s||r.scrutin===s) && (!c||r.circonscription===c) && (!t||r.statut===t) &&
      (!q || norm([r.id, r.circonscription, (r.numeros_ce||[]).join(' '), r.objet, (r.griefs||[]).join(' '), r.juridiction_saisie].join(' ')).includes(q)))
      .sort((a,b) => String(b.date_decision||b.date_depot||'').localeCompare(String(a.date_decision||a.date_depot||'')));
    const n = (REC.recours||[]).length;
    document.getElementById('ctCount').textContent = L.length===n ? `${n} recours` : `${L.length} sur ${n} recours`;
    const el = document.getElementById('ctRecours');
    if(!L.length){ el.innerHTML = '<div class="ct-empty">Aucun recours ne correspond à ces critères.</div>'; return; }
    el.innerHTML = L.map(r => {
      // décision détectée sur un recours « En cours », ou plus récente que la décision enregistrée : à vérifier
      const nouv = detPar(r.id).filter(d => r.statut==='En cours' || !r.date_decision || d.date>r.date_decision);
      return `<article class="glass ct-card">
        <div><div class="ct-eyebrow">${r.scrutin==='AFE' ? "Conseillers à l'AFE" : "Conseillers des Français de l'étranger"}</div><h4>${esc(r.circonscription)}</h4></div>
        <span class="ct-pill ${CLASSE[r.statut]||'ct-neu'}">${esc(r.statut)}</span>
        <div class="ct-meta ct-full">
          ${r.date_depot ? `<span>Protestation enregistrée le <b>${dateFr(r.date_depot)}</b></span>` : ''}
          ${r.date_decision ? `<span>Décision du <b>${dateFr(r.date_decision)}</b></span>` : ''}
          ${(r.numeros_ce||[]).length ? `<span>CE n° <b>${esc(r.numeros_ce.join(', '))}</b></span>` : '<span>Numéro de dossier inconnu</span>'}
          ${r.formation ? `<span>${esc(r.formation)}</span>` : ''}
        </div>
        ${r.objet ? `<p class="ct-full">${esc(r.objet)}</p>` : ''}
        ${r.consequence ? `<p class="ct-full"><b>Conséquence :</b> ${esc(r.consequence)}</p>` : ''}
        ${(r.griefs||[]).length || r.juridiction_saisie ? `<details class="ct-full"><summary>Griefs et procédure</summary><ul>${(r.griefs||[]).map(g => `<li>${esc(g)}</li>`).join('')}${r.juridiction_saisie ? `<li>Saisine : ${esc(r.juridiction_saisie)}</li>` : ''}</ul></details>` : ''}
        ${nouv.length ? `<div class="ct-flag ct-full">Décision détectée – vérification en cours : n° ${nouv.map(d => esc(d.numero)+' du '+dateFr(d.date)).join(', ')}</div>` : ''}
        <div class="small ct-full">${r.source ? `<a href="${esc(r.source)}" target="_blank" rel="noopener">Texte de la décision (Conseil d'État)</a> · ` : ''}Vérifié le ${dateFr(r.verifie_le)}</div>
      </article>`;
    }).join('');
  }

  function rendreDetections(){
    const el = document.getElementById('ctDet');
    if(!DET){ el.innerHTML = '<div class="ct-empty">La veille automatique n\'a pas encore produit de données.</div>'; return; }
    const L = (DET.decisions||[]).filter(d => !d.recours);
    if(!L.length){ el.innerHTML = '<div class="ct-empty">Aucune décision en attente de vérification. Les décisions déjà rattachées à un recours vérifié figurent dans la liste ci-dessus.</div>'; return; }
    el.innerHTML = L.map(d => `<article class="glass ct-card ct-det">
      <div><div class="ct-eyebrow">${esc(d.scrutin)}${d.circonscriptions && d.circonscriptions.length ? ' · '+esc(d.circonscriptions.join(', ')) : ''}</div><h4>CE n° ${esc(d.numero)} du ${dateFr(d.date)}</h4></div>
      <span class="ct-pill ct-warn">À vérifier</span>
      <div class="ct-meta ct-full"><span>${esc(d.type||'Décision')}</span>${d.solution ? `<span>Solution : <b>${esc(d.solution)}</b></span>` : ''}${d.formation ? `<span>${esc(d.formation)}</span>` : ''}<span>Pertinence : ${esc(d.score)}/6</span><span>Repérée le ${dateFr(d.premiere_detection)}</span></div>
      ${d.extrait ? `<p class="ct-extrait ct-full">« ${esc(d.extrait)} »</p>` : ''}
      <div class="small ct-full"><a href="${esc(d.source)}" target="_blank" rel="noopener">Texte de la décision (Conseil d'État)</a></div>
    </article>`).join('');
  }

  function rendreVeille(){
    const el = document.getElementById('ctVeille');
    if(!DET){ el.innerHTML = '<p class="small">Aucune collecte enregistrée.</p>'; return; }
    const A = DET.archives || {}; let tot = 0;
    const rows = Object.keys(A).sort().reverse().map(l => { tot += A[l]||0; return `<tr><td>${moisFr(l)}</td><td class="num">${A[l]==null ? '<span class="small">non publiée</span>' : A[l].toLocaleString('fr-FR')}</td></tr>`; }).join('');
    const rapp = (DET.decisions||[]).filter(d => d.recours).length;
    el.innerHTML = `<p class="small">Dernière vérification enregistrée : <b>${dateFr(DET.derniere_verification)}</b>. Collecte quotidienne ; les données ne sont réenregistrées que si elles changent, et au moins une fois par semaine.</p>
      <div class="ct-meta"><span><b>${tot.toLocaleString('fr-FR')}</b> décisions lues</span><span><b>${(DET.decisions||[]).length}</b> retenues</span><span><b>${rapp}</b> rattachées à un recours</span><span><b>${DET.ecartees_masquees||0}</b> écartées après examen</span></div>
      ${(DET.avertissements||[]).length ? `<div class="ct-avert">${DET.avertissements.map(esc).join('<br>')}</div>` : ''}
      <div class="tblx"><table class="ct-tbl"><thead><tr><th>Archive du Conseil d'État</th><th class="num">Décisions lues</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // indicateurs du bandeau d'en-tête (recours vérifiés uniquement)
  function kpis(){
    if(!REC) return [];
    const R = REC.recours||[], n = f => String(R.filter(f).length);
    const lues = DET ? Object.values(DET.archives||{}).reduce((a,x) => a+(x||0), 0) : 0;
    return [[String(R.length),'recours vérifiés'],[n(r => r.statut!=='En cours'),'jugés'],[n(r => r.statut==='En cours'),'en cours (connus)'],
      [n(r => r.statut==='Annulation'||r.statut==='Réformation'),'annulations ou réformations']].concat(lues ? [[lues.toLocaleString('fr-FR'),'décisions du Conseil d\'État analysées']] : []);
  }

  window.CONTENTIEUX = {
    kpis,
    render(el, cb){
      if(cb) onData = cb;
      if(ROOT===el) return;
      ROOT = el; squelette(el);
      PRET = Promise.all([charger('recours.json'), charger('detections.json').catch(() => null)]).then(v => {
        REC = v[0]; DET = v[1]; remplir(); if(onData) onData();
      }).catch(e => { document.getElementById('ctRecours').innerHTML = `<div class="ct-empty">Données indisponibles (${esc(e.message)}).</div>`; });
    }
  };
})();
