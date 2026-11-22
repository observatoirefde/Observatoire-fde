// Chargement des données avant l’initialisation de la carte et des tableaux.
async function demarrerObservatoire() {
  try {
    const [repConsulaires, repLegislatives] = await Promise.all([
      fetch('./data/consulaires-2026.json'),
      fetch('./data/legislatives-2024.json')
    ]);
    if (!repConsulaires.ok || !repLegislatives.ok) {
      throw new Error('Un des fichiers de données est introuvable.');
    }
    const DATA = await repConsulaires.json();
    const L24 = await repLegislatives.json();
    const BLOCS = {
      LFI:{n:"LFI / gauche radicale"}, GAU:{n:"Gauche (PS, Français du Monde, union)"}, ECO:{n:"Écologistes"},
      ENS:{n:"Bloc central (Renaissance, MoDem, Horizons…)"}, ASFE:{n:"ASFE & centre-droit indépendant"},
      LR:{n:"Droite (LR, « La France au cœur »)"}, ED:{n:"RN, Reconquête, « Patriotes »"}, IND:{n:"Listes locales / indépendantes"}
    };
    const ORDER = ["LFI","GAU","ECO","ENS","ASFE","LR","ED","IND"];
    const css = getComputedStyle(document.documentElement);
    ORDER.forEach(b=>BLOCS[b].c = css.getPropertyValue('--'+b).trim());
    const LEG = {1:"Amérique du Nord",2:"Amérique latine et Caraïbes",3:"Europe du Nord",4:"Benelux",5:"Péninsule ibérique, Monaco",6:"Suisse, Liechtenstein",7:"Europe centrale et orientale (dont Allemagne)",8:"Europe du Sud, Turquie, Israël",9:"Maghreb et Afrique de l'Ouest",10:"Afrique centrale, australe, orientale, Moyen-Orient",11:"Europe de l'Est, Asie, Océanie"};
    const CONF = {h:"●●●",m:"●●",l:"●"};
    const fmt = n => n.toLocaleString('fr-FR');
    const pct = x => (x*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';

    // overrides
    let OV = {};
    try{ OV = JSON.parse(localStorage.getItem('cfde_ov')||'{}'); }catch(e){}
    const blocOf = (c,l) => OV[c.id+'-'+l.n] || l.b;
    function saveOv(){ try{ localStorage.setItem('cfde_ov', JSON.stringify(OV)); }catch(e){} document.getElementById('ovInfo').textContent = Object.keys(OV).length ? Object.keys(OV).length+' reclassement(s) actif(s)' : ''; }

    function circAgg(c){
      const s={}, v={}; ORDER.forEach(b=>{s[b]=0;v[b]=0});
      let tv=0, ts=0;
      c.lists.forEach(l=>{const b=blocOf(c,l); s[b]+=l.s; v[b]+=l.v; tv+=l.v; ts+=l.s;});
      const bySeats = ORDER.filter(b=>s[b]>0).sort((a,b)=>s[b]-s[a]||v[b]-v[a]);
      const topVote = ORDER.slice().sort((a,b)=>v[b]-v[a])[0];
      // majority bloc in seats: largest seat-holder (tie → votes)
      return {s,v,tv,ts,major:bySeats[0],topVote};
    }
    function presBloc(c){
      if(!c.pres) return null;
      const p=c.pres[0]; if(!p.list) return 'UNK';
      const l=c.lists.find(x=>x.n===p.list); return blocOf(c,l);
    }

    // KPIs
    const KPI_CFDE = (function(){
      const tv = DATA.reduce((a,c)=>a+c.lists.reduce((x,l)=>x+l.v,0),0);
      const np = DATA.filter(c=>c.pres).length;
      return [["433","conseillers des Français de l'étranger"],["130","circonscriptions consulaires"],["77","délégués consulaires"],[fmt(tv),"suffrages exprimés"],[np+" / 130","présidents de conseil renseignés"]];
    })();

    function renderSeatsBar(){
      const s={}; ORDER.forEach(b=>s[b]=0);
      DATA.forEach(c=>c.lists.forEach(l=>s[blocOf(c,l)]+=l.s));
      const tot=433;
      document.getElementById('seatsbar').innerHTML = `<div class="small" style="margin-bottom:2px"><b style="color:var(--ink);font-size:13px">Répartition des 433 CFDE par bloc</b> · survolez un segment pour voir le détail</div>
       <div class="stack">${ORDER.filter(b=>s[b]).map(b=>`<div data-tt="${BLOCS[b].n} : ${s[b]} sièges (${pct(s[b]/tot)})" style="width:${s[b]/tot*100}%;background:${BLOCS[b].c}"></div>`).join('')}</div>
       <div class="lg">${ORDER.map(b=>`<span><span class="sq" style="background:${BLOCS[b].c}"></span>${BLOCS[b].n} <b style="color:var(--ink)">${s[b]}</b></span>`).join('')}</div>`;
    }

    // legend + leg filter
    document.getElementById('legend').innerHTML = ORDER.map(b=>`<span><span class="sw" style="background:${BLOCS[b].c}"></span>${BLOCS[b].n}</span>`).join('') + `<span><span class="sw" style="background:#fff;border:1.5px dashed #888"></span>Président non renseigné</span><span class="hint">Taille des cercles proportionnelle au nombre de sièges. Traits sombres et étiquettes : contours des 11 circonscriptions législatives.</span>`;
    const legf=document.getElementById('legf');
    for(let i=1;i<=11;i++) legf.insertAdjacentHTML('beforeend',`<option value="${i}">${i}e — ${LEG[i]}</option>`);

    const C2LEG = {1:["United States","Canada","Puerto Rico","Bermuda"],
     2:["Mexico","Guatemala","Belize","El Salvador","Honduras","Nicaragua","Costa Rica","Panama","Cuba","Jamaica","Haiti","Dominican Rep.","Bahamas","Trinidad and Tobago","Saint Lucia","Dominica","Grenada","St. Vin. and Gren.","Antigua and Barb.","Barbados","Colombia","Venezuela","Guyana","Suriname","Ecuador","Peru","Bolivia","Brazil","Paraguay","Uruguay","Argentina","Chile","Curaçao","Cayman Is.","Turks and Caicos Is."],
     3:["United Kingdom","Ireland","Iceland","Norway","Sweden","Finland","Denmark","Estonia","Latvia","Lithuania","Isle of Man","Jersey","Aland","Faeroe Is."],
     4:["Belgium","Netherlands","Luxembourg"], 5:["Spain","Portugal","Andorra"], 6:["Switzerland","Liechtenstein"],
     7:["Germany","Austria","Slovakia","Slovenia","Croatia","Hungary","Czech Rep.","Poland","Romania","Bulgaria","Serbia","Bosnia and Herz.","Macedonia","Albania","Montenegro"],
     8:["Italy","Malta","Greece","Cyprus","N. Cyprus","Turkey","Israel","Palestine"],
     9:["Morocco","W. Sahara","Algeria","Tunisia","Libya","Mauritania","Mali","Niger","Burkina Faso","Senegal","Gambia","Guinea-Bissau","Guinea","Sierra Leone","Liberia","Côte d'Ivoire","Cape Verde"],
     10:["Egypt","Sudan","S. Sudan","Eritrea","Ethiopia","Djibouti","Somalia","Kenya","Uganda","Rwanda","Burundi","Tanzania","Dem. Rep. Congo","Congo","Gabon","Eq. Guinea","Cameroon","Central African Rep.","Chad","Nigeria","Benin","Togo","Ghana","São Tomé and Principe","Angola","Zambia","Malawi","Mozambique","Zimbabwe","Botswana","Namibia","South Africa","Lesotho","Swaziland","Madagascar","Comoros","Mauritius","Seychelles","Saudi Arabia","Yemen","Oman","United Arab Emirates","Qatar","Bahrain","Kuwait","Iraq","Jordan","Syria","Lebanon"],
     11:["Russia","Belarus","Ukraine","Moldova","Georgia","Armenia","Azerbaijan","Iran","Afghanistan","Pakistan","Kazakhstan","Uzbekistan","Turkmenistan","Kyrgyzstan","Tajikistan","India","Nepal","Bhutan","Bangladesh","Sri Lanka","Myanmar","Thailand","Lao PDR","Cambodia","Vietnam","Malaysia","Singapore","Brunei","Indonesia","Timor-Leste","Philippines","China","Mongolia","Korea","Dem. Rep. Korea","Japan","Australia","New Zealand","Papua New Guinea","Fiji","Vanuatu","Solomon Is.","Samoa","Tonga","Micronesia","Palau"]};
    const COUNTRY_LEG = {}; Object.entries(C2LEG).forEach(([g,arr])=>arr.forEach(n=>COUNTRY_LEG[n]=+g));

    // --- contours des circonscriptions législatives (fusion des pays, frontières internes supprimées)
    const LEG_SHADE = {1:'#dfe7f0',2:'#d2dce8',3:'#dfe7f0',4:'#d2dce8',5:'#e8eef4',6:'#d2dce8',7:'#dfe7f0',8:'#e8eef4',9:'#d2dce8',10:'#dfe7f0',11:'#d2dce8'};
    const LEG_ANCHOR = {1:[-100,50],2:[-60,-12],3:[16,64],4:[1.6,53.6],5:[-5,40],6:[8.6,45.9],7:[16,50.5],8:[13.5,42],9:[-3,17],10:[26,-6],11:[95,38]};
    const ORD = g => g===1?'1re':g+'e';
    let LEG_LINES=null;
    function legOutlines(){
      if(LEG_LINES) return LEG_LINES;
      const gj=echarts.getMap('world').geoJson; const sc=gj.UTF8Scale||1024;
      const dec=(s,o)=>{const r=[];let px=o[0],py=o[1];for(let i=0;i<s.length;i+=2){let x=s.charCodeAt(i)-64,y=s.charCodeAt(i+1)-64;x=(x>>1)^(-(x&1));y=(y>>1)^(-(y&1));x+=px;y+=py;px=x;py=y;r.push([x/sc,y/sc]);}return r;};
      const rings=f=>{const g=f.geometry; if(g.type==='Polygon') return g.coordinates.map((s,i)=>typeof s==='string'?dec(s,g.encodeOffsets[i]):s); return g.coordinates.flatMap((p,i)=>p.map((s,j)=>typeof s==='string'?dec(s,g.encodeOffsets[i][j]):s));};
      const K=p=>p[0].toFixed(4)+','+p[1].toFixed(4); const SK=(a,b)=>{const x=K(a),y=K(b);return x<y?x+'|'+y:y+'|'+x;};
      const feats=gj.features.map(f=>({n:f.properties.name, g:COUNTRY_LEG[f.properties.name]||0, r:rings(f)}));
      const owners={}, nf={}; feats.forEach(f=>f.r.forEach(r=>{for(let i=0;i<r.length-1;i++){const k=SK(r[i],r[i+1]);(owners[k]=owners[k]||new Set()).add(f.g); nf[k]=(nf[k]||0)+1;}}));
      // index des sommets par cellule de 0,5° pour repérer les frontières internes dont les sommets ne coïncident pas exactement
      const grid={}; const cellK=(x,y)=>Math.floor(x*2)+':'+Math.floor(y*2);
      feats.forEach((f,fi)=>{ if(!f.g) return; f.r.forEach(r=>r.forEach(p=>{const ck=cellK(p[0],p[1]); (grid[ck]=grid[ck]||[]).push([p[0],p[1],fi,f.g]);}));});
      const nearSameCirc=(a,b,fi,g)=>{const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const arr=grid[(Math.floor(mx*2)+dx)+':'+(Math.floor(my*2)+dy)]; if(!arr) continue;
          for(const v of arr){ if(v[2]!==fi && v[3]===g && Math.abs(v[0]-mx)<0.25 && Math.abs(v[1]-my)<0.25) return true; }}
        return false;};
      const done=new Set(), lines=[];
      feats.forEach((f,fi)=>{ if(!f.g) return; f.r.forEach(r=>{let cur=null;
        for(let i=0;i<r.length-1;i++){const k=SK(r[i],r[i+1]); const o=owners[k]; const internal = (o.size===1 && [...o][0]===f.g && nf[k]>1) || (nf[k]===1 && nearSameCirc(r[i],r[i+1],fi,f.g));
          if(internal||done.has(k)){ if(cur&&cur.length>1) lines.push({coords:cur}); cur=null; continue; }
          done.add(k); if(!cur) cur=[r[i]]; cur.push(r[i+1]); }
        if(cur&&cur.length>1) lines.push({coords:cur}); }); });
      LEG_LINES=lines; return lines;
    }
    function legLayers(opts){
      const lines=legOutlines();
      return [
        {type:'lines', coordinateSystem:'geo', polyline:true, silent:true, zlevel:1, data:lines, lineStyle:{color:'#5d6b7d', width:opts&&opts.w||1.1, opacity:.85}, animation:false},
        {type:'scatter', coordinateSystem:'geo', silent:true, zlevel:3, symbolSize:1, itemStyle:{color:'rgba(0,0,0,0)'}, animation:false,
         data:Object.entries(LEG_ANCHOR).map(([g,c])=>({name:ORD(+g), value:c})),
         label:{show:true, formatter:p=>p.name, color:'#18212d', fontSize:10.5, fontWeight:700, fontFamily:'Manrope', backgroundColor:'rgba(255,255,255,.9)', borderColor:'rgba(93,107,125,.45)', borderWidth:.8, borderRadius:9, padding:[2,6], shadowColor:'rgba(40,62,92,.15)', shadowBlur:6}}
      ];
    }
    function legRegions(fill){
      return Object.entries(COUNTRY_LEG).map(([n,g])=>{const c=fill(g); return {name:n, itemStyle:{areaColor:c.area, borderColor:c.area, borderWidth:.6, opacity:c.op==null?1:c.op}, emphasis:{itemStyle:{areaColor:c.area}}};});
    }

    // map
    // carte des consulaires : créée et dessinée seulement quand sa page est affichée (allège l'accueil)
    let chart = null, MAP_DIRTY = true, MAP_KEEP = true;
    function ensureChart(){
      if(chart) return false;
      chart = echarts.init(document.getElementById('map'));
      chart.on('click', p=>{ if(p.seriesType==='scatter'){ select(p.data.id); if(innerWidth<1100) document.getElementById('panel').scrollIntoView({behavior:'smooth',block:'start'}); } });
      window.addEventListener('resize', ()=>chart&&chart.resize());
      return true;
    }
    let MODE='seats', SEL=null, LEGF=0;
    const VIEWS = {world:{center:[20,20],zoom:innerWidth<640?1.25:1.15}, eu:{center:[12,50],zoom:4.6}, am:{center:[-75,15],zoom:2.0}, af:{center:[25,8],zoom:2.4}, as:{center:[110,10],zoom:2.1}};
    function pointColor(c,a){
      if(MODE==='seats') return BLOCS[a.major].c;
      if(MODE==='votes') return BLOCS[a.topVote].c;
      const pb=presBloc(c); if(!pb) return '#ffffff'; if(pb==='UNK') return '#6f747c'; return BLOCS[pb].c;
    }
    function renderMap(keepView){
      if(document.getElementById('v-cfde').hidden){ MAP_DIRTY=true; MAP_KEEP = MAP_KEEP && keepView; return; }
      if(ensureChart()) keepView=false;
      MAP_DIRTY=false; MAP_KEEP=true;
      const pts = DATA.filter(c=>!LEGF||c.leg===LEGF).map(c=>{
        const a=circAgg(c); const col=pointColor(c,a);
        return {name:c.name, id:c.id, value:[c.lon,c.lat,a.ts],
          symbolSize: (innerWidth<640?5:7)+Math.sqrt(a.ts)*(innerWidth<640?4.2:6.5),
          itemStyle:{color:col, borderColor: (MODE==='pres'&&!c.pres)?'#777':(c.id===SEL?'#1d1f23':'#ffffff'), borderWidth: c.id===SEL?2.5:1.5, borderType:(MODE==='pres'&&!c.pres)?'dashed':'solid', opacity:.92}};
      });
      const opt = {
        tooltip:{trigger:'item', confine:true, backgroundColor:'rgba(24,33,45,.9)', borderWidth:0, padding:[8,11], extraCssText:'border-radius:10px;box-shadow:0 8px 24px rgba(20,30,45,.2);', textStyle:{color:'#fff',fontSize:12,fontFamily:'Inter'},
          formatter:p=>{ if(p.seriesType!=='scatter') return p.name; const c=DATA[p.data.id], a=circAgg(c);
            const parts=ORDER.filter(b=>a.s[b]).map(b=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BLOCS[b].c};margin-right:4px"></span>${BLOCS[b].n.split(' (')[0]} ${a.s[b]}`).join('<br>');
            const pr = c.pres? '<br><i>Président : '+c.pres.map(x=>x.name).join(', ')+'</i>':'';
            return `<b>${c.name}</b><br><span style="opacity:.75">${c.posts} · ${c.leg}e circ. législative</span><br>${a.ts} CFDE · ${fmt(a.tv)} voix<br>${parts}${pr}`; }},
        geo:{map:'world', roam:true, scaleLimit:{min:1,max:14}, itemStyle:{areaColor:'#f1f4f8', borderColor:'#ffffff', borderWidth:.6},
          emphasis:{itemStyle:{areaColor:'#e4ebf2'}, label:{show:false}}, label:{show:false},
          regions: legRegions(g=>({area: LEGF ? (g===LEGF?'#bfcddd':'#e9eef4') : LEG_SHADE[g]}))},
        series:[{type:'scatter', coordinateSystem:'geo', data:pts, emphasis:{itemStyle:{borderColor:'#1d1f23',borderWidth:2.5}}, zlevel:2}].concat(legLayers())
      };
      if(!keepView){ const v=VIEWS[curView]; opt.geo.center=v.center; opt.geo.zoom=v.zoom; }
      chart.setOption(opt, false);
    }
    let curView='world';

    function segs(id, cb){ const el=document.getElementById(id); el.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; el.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); cb(b.dataset.v);}); }
    segs('mode', v=>{MODE=v; renderMap(true);});
    segs('zoom', v=>{curView=v; renderMap(false);});
    legf.addEventListener('change', ()=>{LEGF=+legf.value; renderMap(true); renderProj();});

    // panel
    function stackHTML(map, total){
      return `<div class="stack">${ORDER.filter(b=>map[b]).map(b=>`<div data-tt="${BLOCS[b].n} : ${typeof map[b]==='number'&&total? (Number.isInteger(map[b])? fmt(map[b]):'')+' ('+pct(map[b]/total)+')':''}" style="width:${map[b]/total*100}%;background:${BLOCS[b].c}"></div>`).join('')}</div>`;
    }
    function select(id){
      SEL=id; const c=DATA[id], a=circAgg(c);
      const rows = c.lists.slice().sort((x,y)=>y.v-x.v).map(l=>{
        const b=blocOf(c,l); const ov=OV[c.id+'-'+l.n];
        return `<tr class="${l.s?'elu':''}"><td>${l.name}${l.dc?`<div class="small">+ ${l.dc} délégué(s) consulaire(s)</div>`:''}<div class="small">${ov?'Reclassé par vous':l.why}<span class="conf">${ov?'':CONF[l.c]}</span></div></td>
          <td><select data-k="${c.id}-${l.n}" style="border-left:4px solid ${BLOCS[b].c}">${ORDER.map(o=>`<option value="${o}" ${o===b?'selected':''}>${BLOCS[o].n.split(' (')[0]}</option>`).join('')}</select></td>
          <td class="num">${fmt(l.v)}<div class="small">${pct(l.v/a.tv)}</div></td><td class="num"><b>${l.s||''}</b></td></tr>`;}).join('');
      const pres = c.pres ? c.pres.map(p=>{const pb = p.list? blocOf(c,c.lists.find(x=>x.n===p.list)) : null;
          return `<div><b>${p.name}</b>${pb?` <span class="pill" style="background:${BLOCS[pb].c}">${BLOCS[pb].n.split(' (')[0]}</span>`:' <span class="small">(liste d\'origine non identifiée)</span>'}<div class="small">Source : ${p.src}</div></div>`}).join('')
        : `<span class="small">Président du conseil consulaire non renseigné ici : pas trouvé dans les sources consultées. Voir le site de l'ambassade ou du consulat.</span>`;
      document.getElementById('panel').innerHTML = `<h2>${c.name}</h2>
        <div class="meta">${c.posts} · ${c.leg}e circonscription législative (${LEG[c.leg]}) · ${a.ts} CFDE${c.uninominal?' · scrutin uninominal':''} · ${fmt(a.tv)} voix</div>
        <div class="pres">Présidence du conseil consulaire<br>${pres}</div>
        <div class="small">Sièges CFDE par bloc</div>${stackHTML(a.s,a.ts)}
        <div class="small" style="margin-top:6px">Voix par bloc</div>${stackHTML(a.v,a.tv)}
        <table style="margin-top:10px"><thead><tr><th>Liste / candidat</th><th>Bloc</th><th class="num">Voix</th><th class="num">Élus</th></tr></thead><tbody>${rows}</tbody></table>`;
      document.querySelectorAll('#panel select').forEach(s=>s.addEventListener('change',()=>{
        const [cid,ln]=s.dataset.k.split('-').map(Number); const l=DATA[cid].lists.find(x=>x.n===ln);
        if(s.value===l.b) delete OV[s.dataset.k]; else OV[s.dataset.k]=s.value; saveOv(); renderSeatsBar(); renderProj(); renderTable(); select(cid);
      }));
      renderMap(true);
    }

    // projection
    function renderProj(){
      const asfeTo=document.getElementById('asfeTo').value, indMode=document.getElementById('indMode').value, leftMode=document.getElementById('leftMode').value;
      const COAL = leftMode==='union'
        ? [{k:'G',n:'Gauche unie (LFI+PS+Éco.)',from:['LFI','GAU','ECO'],c:BLOCS.GAU.c}]
        : [{k:'LFI',n:'LFI',from:['LFI'],c:BLOCS.LFI.c},{k:'GAU',n:'PS / gauche',from:['GAU'],c:BLOCS.GAU.c},{k:'ECO',n:'Écologistes',from:['ECO'],c:BLOCS.ECO.c}];
      COAL.push({k:'C',n:'Bloc central'+(asfeTo==='ENS'?' + ASFE':''),from:['ENS'].concat(asfeTo==='ENS'?['ASFE']:[]),c:BLOCS.ENS.c});
      if(asfeTo==='sep') COAL.push({k:'A',n:'ASFE',from:['ASFE'],c:BLOCS.ASFE.c});
      COAL.push({k:'D',n:'Droite'+(asfeTo==='LR'?' + ASFE':''),from:['LR'].concat(asfeTo==='LR'?['ASFE']:[]),c:BLOCS.LR.c});
      COAL.push({k:'E',n:'RN / ext. droite',from:['ED'],c:BLOCS.ED.c});
      if(indMode==='incl') COAL.push({k:'I',n:'Indépendants',from:['IND'],c:BLOCS.IND.c});
      let html='';
      for(let g=1; g<=11; g++){
        const cs=DATA.filter(c=>c.leg===g); const v={}; ORDER.forEach(b=>v[b]=0); let seats=0;
        cs.forEach(c=>c.lists.forEach(l=>{v[blocOf(c,l)]+=l.v; seats+=l.s;}));
        const cv={}; COAL.forEach(k=>cv[k.k]=k.from.reduce((a,b)=>a+v[b],0));
        const tot = Object.values(cv).reduce((a,b)=>a+b,0);
        const totAll = ORDER.reduce((a,b)=>a+v[b],0);
        const rank = COAL.slice().sort((a,b)=>cv[b.k]-cv[a.k]);
        const [p1,p2]=rank; const gap=(cv[p1.k]-cv[p2.k])/tot;
        const tight = gap<0.05 ? 'serré' : gap<0.12 ? 'avantage' : 'net avantage';
        const bar = `<div class="stack" style="height:18px">${COAL.filter(k=>cv[k.k]).map(k=>`<div data-tt="${k.n} : ${pct(cv[k.k]/tot)} (${fmt(cv[k.k])} voix)" style="width:${cv[k.k]/tot*100}%;background:${k.c}"></div>`).join('')}</div>
          <div class="small">${COAL.filter(k=>cv[k.k]).map(k=>`${k.n.split(' (')[0]} ${pct(cv[k.k]/tot)}`).join(' · ')}</div>`;
        html += `<div class="projrow ${LEGF===g?'sel':''}" data-g="${g}"><div class="nm"><b>${g===1?'1re':g+'e'} circonscription</b><span>${LEG[g]} · ${cs.length} circ. consulaires · ${seats} CFDE · ${fmt(totAll)} voix${indMode==='excl'?' · '+pct(v.IND/totAll)+' de voix indépendantes exclues':''}</span></div>
          <div>${bar}</div>
          <div class="verdict"><span class="pill" style="background:${p1.c}">${p1.n.split(' (')[0]}</span> en tête, ${tight} (${(gap*100).toLocaleString('fr-FR',{maximumFractionDigits:1})} pts)<div class="small">Duel probable : ${p1.n.split(' (')[0]} contre ${p2.n.split(' (')[0]}</div></div></div>`;
      }
      const el=document.getElementById('proj'); el.innerHTML=html;
      el.querySelectorAll('.projrow').forEach(r=>r.addEventListener('click',()=>{ const g=+r.dataset.g; LEGF = LEGF===g?0:g; legf.value=LEGF; renderProj(); showTab('cfde'); renderMap(true); document.getElementById('map').scrollIntoView({behavior:'smooth',block:'center'}); }));
    }
    ['asfeTo','indMode','leftMode'].forEach(id=>document.getElementById(id).addEventListener('change',renderProj));

    // table
    function renderTable(){
      const sb=document.getElementById('sortBy').value;
      const rows=DATA.map(c=>({c,a:circAgg(c)}));
      rows.sort((x,y)=> sb==='seats'? y.a.ts-x.a.ts : sb==='votes'? y.a.tv-x.a.tv : sb==='leg'? x.c.leg-y.c.leg||x.c.name.localeCompare(y.c.name) : x.c.name.localeCompare(y.c.name,'fr'));
      document.getElementById('tbl').innerHTML = `<thead><tr><th>Circonscription consulaire</th><th>Circ. lég.</th><th class="num">CFDE</th><th class="num">Voix</th><th style="width:28%">Sièges par bloc</th><th>Bloc majoritaire</th><th>Président(e)</th></tr></thead><tbody>`+
       rows.map(({c,a})=>`<tr data-id="${c.id}" style="cursor:pointer"><td><b>${c.name}</b><div class="small">${c.posts}</div></td><td>${c.leg}e</td><td class="num">${a.ts}</td><td class="num">${fmt(a.tv)}</td><td>${stackHTML(a.s,a.ts)}</td>
         <td><span class="tag"><span class="sw" style="background:${BLOCS[a.major].c}"></span>${BLOCS[a.major].n.split(' (')[0]}</span></td><td>${c.pres?c.pres.map(p=>p.name).join('<br>'):'<span class="small">n.r.</span>'}</td></tr>`).join('')+'</tbody>';
      document.querySelectorAll('#tbl tbody tr').forEach(tr=>tr.addEventListener('click',()=>{select(+tr.dataset.id); document.getElementById('map').scrollIntoView({behavior:'smooth',block:'center'});}));
    }
    document.getElementById('sortBy').addEventListener('change',renderTable);

    document.getElementById('copyOv').addEventListener('click', async ()=>{
      const txt = JSON.stringify(OV,null,1);
      try{ await navigator.clipboard.writeText(txt); document.getElementById('ovInfo').textContent='Copié ('+Object.keys(OV).length+' reclassement(s)).'; }
      catch(e){ document.getElementById('ovInfo').textContent='Copie impossible ici : '+txt; }
    });

    // tooltip for stacks
    const tt=document.getElementById('tt');
    document.addEventListener('mousemove',e=>{ const t=e.target.closest('[data-tt]'); if(t&&t.dataset.tt){ tt.style.display='block'; tt.textContent=t.dataset.tt; tt.style.left=Math.min(e.clientX+12, innerWidth-290)+'px'; tt.style.top=(e.clientY+14)+'px'; } else tt.style.display='none'; });

    document.addEventListener('touchstart',e=>{ const t=e.target.closest('[data-tt]'); if(!t||!t.dataset.tt) return; const p=e.touches[0]; tt.style.display='block'; tt.textContent=t.dataset.tt; tt.style.left=Math.max(8,Math.min(p.clientX-60, innerWidth-290))+'px'; tt.style.top=(p.clientY-48)+'px'; clearTimeout(window._ttT); window._ttT=setTimeout(()=>tt.style.display='none',2500); },{passive:true});
    function refreshAll(keep){ renderSeatsBar(); renderMap(keep); renderProj(); renderTable(); if(SEL!==null && !keep) select(SEL); }
    saveOv();
    refreshAll(false);
    select(DATA.findIndex(c=>c.name==='Royaume-Uni - 2e circonscription'));

    // ---------- Législatives 2024 ----------
    let TOUR=1, SEL24=null, chart24=null;
    function lead24(g){ const cs=L24[g-1].cands; return TOUR===1 ? cs.slice().sort((a,b)=>b.v1-a.v1)[0] : cs.find(c=>c.e); }
    function short(lab){ return lab.replace(/^NFP \((.*)\)$/,'NFP – $1').replace(/^Ensemble \((.*)\)$/,'Ensemble – $1'); }
    function renderMap24(){
      if(!chart24){ chart24=echarts.init(document.getElementById('map24')); chart24.on('click',p=>{const g=COUNTRY_LEG[p.name]; if(g) selectLeg(g);}); window.addEventListener('resize',()=>chart24&&chart24.resize()); }
      const regions=legRegions(g=>({area:BLOCS[lead24(g).b].c, op: SEL24&&SEL24!==g?0.35:0.9}));
      chart24.setOption({
        tooltip:{trigger:'item', confine:true, backgroundColor:'rgba(24,33,45,.9)', borderWidth:0, padding:[8,11], extraCssText:'border-radius:10px;box-shadow:0 8px 24px rgba(20,30,45,.2);', textStyle:{color:'#fff',fontSize:12,fontFamily:'Inter'}, formatter:p=>{const g=COUNTRY_LEG[p.name]; if(!g) return p.name; const d=L24[g-1]; const tot=d.cands.reduce((a,c)=>a+(TOUR===1?c.v1:(c.v2||0)),0); const top=d.cands.filter(c=>TOUR===1||c.v2).sort((a,b)=>(TOUR===1?b.v1-a.v1:b.v2-a.v2)).slice(0,3); return `<b>${p.name}</b> · ${g}e circonscription<br><span style="opacity:.75">${LEG[g]}</span><br>`+top.map(c=>`${c.n} (${short(c.lab)}) ${pct((TOUR===1?c.v1:c.v2)/tot)}`).join('<br>');}},
        geo:{map:'world', roam:true, center:[20,22], zoom:1.15, scaleLimit:{min:1,max:10}, itemStyle:{areaColor:'#f1f4f8', borderColor:'#ffffff', borderWidth:.5}, emphasis:{label:{show:false}}, label:{show:false}, regions},
        series: legLayers({w:1.3})
      }, true);
      const used=[...new Set(Array.from({length:11},(_,i)=>lead24(i+1).b))];
      document.getElementById('legend24').innerHTML = ORDER.filter(b=>used.includes(b)).map(b=>`<span><span class="sq" style="background:${BLOCS[b].c}"></span>${BLOCS[b].n}</span>`).join('') + '<span class="hint">Traits sombres : contours des 11 circonscriptions législatives. France et outre-mer en gris clair.</span>';
    }
    function renderL24(){
      document.getElementById('l24').innerHTML = L24.map(d=>{
        const t1=d.cands.reduce((a,c)=>a+c.v1,0); const sorted=d.cands.slice().sort((a,b)=>b.v1-a.v1); const max=sorted[0].v1;
        const fin=d.cands.filter(c=>c.v2); const t2=fin.reduce((a,c)=>a+c.v2,0); fin.sort((a,b)=>b.v2-a.v2);
        const el=d.cands.find(c=>c.e);
        const shown=sorted.slice(0,6), rest=sorted.slice(6);
        const restV=rest.reduce((a,c)=>a+c.v1,0);
        return `<div class="card l24card ${SEL24===d.g?'sel':''}" data-g="${d.g}">
          <h4>${d.g===1?'1re':d.g+'e'} circonscription <span class="small" style="font-weight:400">· ${LEG[d.g]}</span></h4>
          <div class="small" style="margin:2px 0 8px">${fmt(d.ins)} inscrits · participation ${d.p1.toLocaleString('fr-FR')} % (T1) / ${d.p2.toLocaleString('fr-FR')} % (T2)</div>
          <div class="small">1er tour, ${fmt(t1)} suffrages exprimés</div>
          ${shown.map(c=>`<div class="cand"><div class="nm" title="${c.n} – ${c.lab}"><span class="sw" style="background:${BLOCS[c.b].c}"></span>${c.n} <span class="small">${short(c.lab)}</span></div><div><div class="bar" style="width:${c.v1/max*100}%;background:${BLOCS[c.b].c}"></div></div><div class="num" style="text-align:right">${pct(c.v1/t1)}</div></div>`).join('')}
          ${rest.length?`<div class="small">+ ${rest.length} ${rest.length>1?'autres candidats':'autre candidat'} : ${pct(restV/t1)}</div>`:''}
          <div class="small" style="margin-top:8px">2nd tour</div>
          <div class="duel">${fin.map(c=>`<div data-tt="${c.n} (${c.lab}) : ${fmt(c.v2)} voix" style="width:${c.v2/t2*100}%;background:${BLOCS[c.b].c}">${c.n.split(' ').slice(1).join(' ')} ${pct(c.v2/t2)}</div>`).join('')}</div>
          <div class="small">Élu(e) : <b style="color:var(--ink)">${el.n}</b> (${el.lab})</div>
          ${d.partielle?`<div class="pres" style="margin:8px 0 0">${d.partielle.txt}</div>`:''}
        </div>`;}).join('');
      document.querySelectorAll('.l24card').forEach(c=>c.addEventListener('click',()=>selectLeg(+c.dataset.g)));
    }
    function selectLeg(g){ SEL24 = SEL24===g?null:g; renderMap24(); renderL24(); renderCmp24(); }
    function renderCmp24(){
      const asfeTo=document.getElementById('asfeTo').value;
      const G=[{k:'G',n:'Gauche unie',from:['LFI','GAU','ECO'],c:BLOCS.GAU.c},{k:'C',n:'Bloc central'+(asfeTo==='ENS'?' (+ ASFE en 2026)':''),from:['ENS'],c:BLOCS.ENS.c},{k:'D',n:'Droite'+(asfeTo==='LR'?' (+ ASFE en 2026)':''),from:['LR'],c:BLOCS.LR.c},{k:'E',n:'RN / ext. droite',from:['ED'],c:BLOCS.ED.c}];
      if(asfeTo==='sep') G.push({k:'A',n:'ASFE (2026 seulement)',from:['ASFE'],c:BLOCS.ASFE.c});
      const rows=[];
      for(let g=1;g<=11;g++){
        const d=L24[g-1]; const v24={}; ORDER.forEach(b=>v24[b]=0); d.cands.forEach(c=>v24[c.b]+=c.v1); const t24=ORDER.reduce((a,b)=>a+v24[b],0);
        const v26={}; ORDER.forEach(b=>v26[b]=0); DATA.filter(c=>c.leg===g).forEach(c=>c.lists.forEach(l=>v26[blocOf(c,l)]+=l.v));
        if(asfeTo==='ENS') v26.ENS+=v26.ASFE; if(asfeTo==='LR') v26.LR+=v26.ASFE; if(asfeTo!=='sep') v26.ASFE=0;
        const t26=ORDER.filter(b=>b!=='IND').reduce((a,b)=>a+v26[b],0);
        rows.push(`<tr ${SEL24===g?'style="background:#f3f2ee"':''}><td><b>${g===1?'1re':g+'e'}</b> <span class="small">${LEG[g]}</span></td>`+G.map(k=>{const a=k.from.reduce((s,b)=>s+v24[b],0)/t24, b=(k.from.reduce((s,x)=>s+v26[x],0)+(k.k==='A'?v26.ASFE:0))/t26; const dd=(b-a)*100;
          return `<td class="num">${k.k==='A'?'–':pct(a)}<div class="small">→ ${pct(b)} <span class="delta ${dd>=0?'up':'down'}">${k.k==='A'?'':(dd>=0?'+':'')+dd.toLocaleString('fr-FR',{maximumFractionDigits:1})}</span></div></td>`}).join('')+`</tr>`);
      }
      document.getElementById('cmp24').innerHTML = `<thead><tr><th>Circonscription</th>${G.map(k=>`<th class="num"><span class="sq" style="background:${k.c}"></span>${k.n}<div class="small" style="text-transform:none">2024 T1 → CFDE 2026</div></th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
    }
    segs('tour24', v=>{TOUR=+v; renderMap24();});
    document.getElementById('asfeTo').addEventListener('change', renderCmp24);

    // =====================================================================
    // ---------- Législatives 2022 ----------
    // =====================================================================
    let L22 = null;
    try { const r = await fetch('./data/legislatives-2022.json'); if (r.ok) L22 = await r.json(); } catch(e) {}
    let TOUR22=1, SEL22=null, chart22=null;
    const fmtD22 = s => new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    const lab22 = c => c.lab;
    function lead22(g){ const cs=L22[g-1].cands; return TOUR22===1 ? cs.slice().sort((a,b)=>b.v1-a.v1)[0] : cs.find(c=>c.e); }
    function renderMap22(){
      if(!L22) return;
      if(!chart22){ chart22=echarts.init(document.getElementById('map22')); chart22.on('click',p=>{const g=COUNTRY_LEG[p.name]; if(g) selectLeg22(g);}); window.addEventListener('resize',()=>chart22&&chart22.resize()); }
      const regions=legRegions(g=>({area:BLOCS[lead22(g).b].c, op: SEL22&&SEL22!==g?0.35:0.9}));
      chart22.setOption({
        tooltip:{trigger:'item', confine:true, backgroundColor:'rgba(24,33,45,.9)', borderWidth:0, padding:[8,11], extraCssText:'border-radius:10px;box-shadow:0 8px 24px rgba(20,30,45,.2);', textStyle:{color:'#fff',fontSize:12,fontFamily:'Inter'},
          formatter:p=>{const g=COUNTRY_LEG[p.name]; if(!g) return p.name; const d=L22[g-1]; const tot=TOUR22===1?d.exp1:d.exp2; const top=d.cands.filter(c=>TOUR22===1||c.v2).sort((a,b)=>(TOUR22===1?b.v1-a.v1:b.v2-a.v2)).slice(0,3); return `<b>${p.name}</b> · ${ORD(g)} circonscription<br><span style="opacity:.75">${LEG[g]}</span><br>`+top.map(c=>`${c.n} (${lab22(c)}) ${pct((TOUR22===1?c.v1:c.v2)/tot)}`).join('<br>');}},
        geo:{map:'world', roam:true, center:[20,22], zoom:1.15, scaleLimit:{min:1,max:10}, itemStyle:{areaColor:'#f1f4f8', borderColor:'#ffffff', borderWidth:.5}, emphasis:{label:{show:false}}, label:{show:false}, regions},
        series: legLayers({w:1.3})
      }, true);
      const used=[...new Set(Array.from({length:11},(_,i)=>lead22(i+1).b))];
      document.getElementById('legend22').innerHTML = ORDER.filter(b=>used.includes(b)).map(b=>`<span><span class="sq" style="background:${BLOCS[b].c}"></span>${b==='GAU'?'NUPES et gauche':BLOCS[b].n}</span>`).join('') + '<span class="hint">Couleur : bloc du candidat en tête au tour choisi. Traits sombres : contours des 11 circonscriptions.</span>';
    }
    function renderL22(){
      if(!L22){ document.getElementById('l22').innerHTML='<div class="glass notes">Le fichier data/legislatives-2022.json est introuvable.</div>'; return; }
      document.getElementById('l22').innerHTML = L22.map(d=>{
        const t1=d.exp1, sorted=d.cands.slice().sort((a,b)=>b.v1-a.v1), max=sorted[0].v1;
        const fin=d.cands.filter(c=>c.v2).sort((a,b)=>b.v2-a.v2), t2=d.exp2, el=d.cands.find(c=>c.e);
        const open = SEL22===d.g;
        const shown = open ? sorted : sorted.slice(0,6), rest = open ? [] : sorted.slice(6);
        const restV=rest.reduce((a,c)=>a+c.v1,0);
        return `<div class="glass l22card ${open?'sel':''}" data-g="${d.g}" role="button" tabindex="0" aria-expanded="${open}">
          <h4>${ORD(d.g)} circonscription <span class="small" style="font-weight:400">· ${LEG[d.g]}</span></h4>
          <div class="small" style="margin:2px 0 8px">${fmt(d.ins)} inscrits · participation ${d.p1.toLocaleString('fr-FR')} % (T1) / ${d.p2.toLocaleString('fr-FR')} % (T2)</div>
          <div class="small">1er tour, ${fmt(t1)} suffrages exprimés</div>
          ${shown.map(c=>`<div class="cand"><div class="nm" title="${c.n} – ${c.lab}"><span class="sw" style="background:${BLOCS[c.b].c}"></span>${c.n} <span class="small">${c.lab}</span></div><div><div class="bar" style="width:${c.v1/max*100}%;background:${BLOCS[c.b].c}"></div></div><div class="num" style="text-align:right">${pct(c.v1/t1)}</div></div>${open?`<div class="small cand-v">${fmt(c.v1)} voix${c.v2?` · 2nd tour : ${fmt(c.v2)} voix`:''}</div>`:''}`).join('')}
          ${rest.length?`<div class="small">+ ${rest.length} ${rest.length>1?'autres candidats':'autre candidat'} : ${pct(restV/t1)} · cliquez pour le détail</div>`:''}
          <div class="small" style="margin-top:8px">2nd tour, ${fmt(t2)} suffrages exprimés</div>
          <div class="duel">${fin.map(c=>`<div data-tt="${c.n} (${c.lab}) : ${fmt(c.v2)} voix" style="width:${c.v2/t2*100}%;background:${BLOCS[c.b].c}">${c.n.split(' ').slice(1).join(' ')} ${pct(c.v2/t2)}</div>`).join('')}</div>
          <div class="small">Élu(e) en juin 2022 : <b style="color:var(--ink)">${el.n}</b> (${el.lab})</div>
          ${d.partielle?`<div class="pres" style="margin:8px 0 0">${d.partielle.txt}</div>`:''}
        </div>`;}).join('');
    }
    function selectLeg22(g){ SEL22 = SEL22===g?null:g; renderMap22(); renderL22(); renderCmp2224(); }
    const GRP4 = [{k:'G',n:'Gauche unie',from:['LFI','GAU','ECO'],c:BLOCS.GAU.c},{k:'C',n:'Bloc central',from:['ENS'],c:BLOCS.ENS.c},{k:'D',n:'Droite',from:['LR'],c:BLOCS.LR.c},{k:'E',n:'RN / ext. droite',from:['ED'],c:BLOCS.ED.c}];
    const blocShares = (cands, key) => { const v={}; ORDER.forEach(b=>v[b]=0); let t=0; cands.forEach(c=>{ const x=c[key]||0; v[c.b]+=x; t+=x; }); return {v,t}; };
    const g4 = b => (GRP4.find(k=>k.from.includes(b))||{k:'I'}).k;
    function renderCmp2224(){
      if(!L22) return;
      const sgn = x => (x>=0?'+':'')+x.toLocaleString('fr-FR',{maximumFractionDigits:1});
      const rows=[]; const T22={}, T24={}; ORDER.forEach(b=>{T22[b]=0;T24[b]=0;}); let t22=0,t24=0, i22=0,v22=0,i24=0,v24=0;
      for(let g=1;g<=11;g++){
        const a=L22[g-1], b=L24[g-1];
        const s22=blocShares(a.cands,'v1'), s24=blocShares(b.cands,'v1');
        ORDER.forEach(x=>{T22[x]+=s22.v[x]; T24[x]+=s24.v[x];}); t22+=s22.t; t24+=s24.t;
        i22+=a.ins; v22+=a.ins*a.p1/100; i24+=b.ins; v24+=b.ins*b.p1/100;
        const e22=a.cands.find(c=>c.e), e24=b.cands.find(c=>c.e);
        const flip = g4(e22.b)!==g4(e24.b);
        rows.push(`<tr ${SEL22===g?'class="cur"':''}><td><b>${ORD(g)}</b> <span class="small">${LEG[g]}</span></td>`+
          GRP4.map(k=>{ const p1=k.from.reduce((s,x)=>s+s22.v[x],0)/s22.t, p2=k.from.reduce((s,x)=>s+s24.v[x],0)/s24.t, dd=(p2-p1)*100;
            return `<td class="num">${pct(p1)}<div class="small">→ ${pct(p2)} <span class="delta ${dd>=0?'up':'down'}">${sgn(dd)}</span></div></td>`; }).join('')+
          `<td class="num">${a.p1.toLocaleString('fr-FR')} %<div class="small">→ ${b.p1.toLocaleString('fr-FR')} % <span class="delta ${b.p1>=a.p1?'up':'down'}">${sgn(b.p1-a.p1)}</span></div></td>
          <td><span class="sw" style="background:${BLOCS[e22.b].c}"></span>${e22.n}<div class="small"><span class="sw" style="background:${BLOCS[e24.b].c}"></span>${e24.n} ${flip?'<span class="flip">changement de bloc</span>':''}</div></td></tr>`);
      }
      const tot = `<tr class="tot"><td><b>Ensemble des 11 circonscriptions</b></td>`+GRP4.map(k=>{ const p1=k.from.reduce((s,x)=>s+T22[x],0)/t22, p2=k.from.reduce((s,x)=>s+T24[x],0)/t24, dd=(p2-p1)*100; return `<td class="num"><b>${pct(p1)}</b><div class="small">→ ${pct(p2)} <span class="delta ${dd>=0?'up':'down'}">${sgn(dd)}</span></div></td>`; }).join('')+
        `<td class="num"><b>${pct(v22/i22)}</b><div class="small">→ ${pct(v24/i24)}</div></td><td></td></tr>`;
      document.getElementById('cmp2224').innerHTML = `<thead><tr><th>Circonscription</th>${GRP4.map(k=>`<th class="num"><span class="sq" style="background:${k.c}"></span>${k.n}<div class="small" style="text-transform:none">1er tour 2022 → 2024</div></th>`).join('')}<th class="num">Participation<div class="small" style="text-transform:none">1er tour 2022 → 2024</div></th><th>Élu(e) 2022<div class="small" style="text-transform:none">→ élu(e) 2024</div></th></tr></thead><tbody>${rows.join('')}${tot}</tbody>`;
      // sièges par bloc
      const seats = (L,yr) => { const s={}; L.forEach(d=>{ const e=d.cands.find(c=>c.e); const k=g4(e.b); s[k]=(s[k]||0)+1; }); return s; };
      const S22=seats(L22), S24=seats(L24);
      const bar = s => `<div class="seatline">${GRP4.filter(k=>s[k.k]).map(k=>`<span style="flex:${s[k.k]};background:${k.c}" title="${k.n} : ${s[k.k]}">${s[k.k]}</span>`).join('')}</div>`;
      document.getElementById('seats2224').innerHTML = `<div class="seatrow"><b>Juin 2022</b>${bar(S22)}</div><div class="seatrow"><b>Juillet 2024</b>${bar(S24)}</div>
        <div class="lg">${GRP4.map(k=>`<span><span class="sq" style="background:${k.c}"></span>${k.n} : ${S22[k.k]||0} → ${S24[k.k]||0}</span>`).join('')}</div>
        <div class="small" style="margin-top:6px">Sièges attribués à l'issue des scrutins généraux de 2022 et 2024, selon le bloc du candidat élu. Les partielles de 2023 (2e, 8e, 9e) ont reconduit les mêmes députés.</div>`;
    }
    segs('tour22', v=>{TOUR22=+v; renderMap22();});
    document.getElementById('l22').addEventListener('click',e=>{ const c=e.target.closest('.l22card'); if(c) selectLeg22(+c.dataset.g); });
    document.getElementById('l22').addEventListener('keydown',e=>{ const c=e.target.closest('.l22card'); if(c&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); selectLeg22(+c.dataset.g); } });
    // ---------- Navigation : deux rubriques et leurs sous-onglets ----------
    const NAV = {
      accueil:{label:'Accueil', items:[{k:'home', l:'Accueil'}]},
      elections:{label:'Élections', items:[
        {k:'leg22', l:'Législatives 2022'},
        {k:'leg24', l:'Législatives 2024'},
        {k:'cfde',  l:'Élections des conseillers des Français de l\'étranger 2026', short:'CFDE 2026'},
        {k:'sim',   l:'Simulateur 2027'}]},
      representants:{label:'Les représentants des Français de l\'étranger', items:[
        {k:'rep-cfde', l:'Conseillers des Français de l\'étranger (CFDE)', short:'CFDE'},
        {k:'cafe',     l:'Conseillers à l\'AFE (CAFE)', short:'CAFE'},
        {k:'dep',      l:'Députés'},
        {k:'sen',      l:'Sénateurs'}]},
      veille:{label:"Activité des parlementaires des Français de l'étranger", items:[
        {k:'veille', l:'Réseaux sociaux'},
        {k:'legislatif', l:'Activité législative'}]}
    };
    // ---------- Élections : présentation de chaque scrutin (data/elections-presentations.json) ----------
    let ELEC_INTRO = null;
    function renderElecIntro(v){
      const d = ELEC_INTRO && ELEC_INTRO[v], view = document.getElementById('v-'+v);
      if(!d || !view || view.querySelector(':scope > .elec-intro')) return;
      const e = s => String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
      view.insertAdjacentHTML('afterbegin', `<section class="glass elec-intro" aria-labelledby="elecIntro-${e(v)}">
        <div class="elec-intro-eyebrow">Présentation du scrutin</div>
        <h3 id="elecIntro-${e(v)}">${e(d.titre)}</h3>
        <p>${e(d.texte)}</p>
        <dl class="elec-facts">${(d.faits||[]).map(f=>`<div><dt>${e(f[0])}</dt><dd>${e(f[1])}${f[2]?`<small>${e(f[2])}</small>`:''}</dd></div>`).join('')}</dl>
        ${d.sources?`<div class="elec-src">${e(d.sources)}</div>`:''}
      </section>`);
    }
    fetch('./data/elections-presentations.json').then(r=>r.ok?r.json():null).then(j=>{ ELEC_INTRO = j; if(j && j[CUR_ROUTE]) renderElecIntro(CUR_ROUTE); }).catch(()=>{});
    const ROUTE = {}; Object.entries(NAV).forEach(([r,o])=>o.items.forEach(it=>ROUTE[it.k]=Object.assign({r},it)));
    ROUTE['veille-comptes']={r:'veille',k:'veille-comptes',l:'Parlementaires et comptes'};
    const VIEWS_ALL = ['home','leg22','cfde','leg24','scen','dep','sim','rep-cfde','cafe','sen','veille','veille-comptes','legislatif','soon'];
    let CUR_ROUTE = 'cfde';
    function renderSubtabs(r){
      const el=document.getElementById('subtabs');
      const activeRoute=CUR_ROUTE==='veille-comptes'?'veille':CUR_ROUTE;
      el.innerHTML = `<span class="sub-label">${NAV[r].label}</span><div class="subtabs-row">`+NAV[r].items.map(it=>`<button data-v="${it.k}" class="${it.k===activeRoute?'on':''}" title="${it.l}">${it.short?`<span class="full">${it.l}</span><span class="short">${it.short}</span>`:it.l}${it.soon?' <span class="soon-dot" aria-label="à venir"></span>':''}</button>`).join('')+'</div>';
    }
    function showTab(v){
      if(v==='scen'){ showTab('cfde'); return; }
      const rt = ROUTE[v] || ROUTE.cfde; v = rt.k; CUR_ROUTE = v;
      updateHero(v);
      document.body.classList.toggle('is-home', v==='home');
      document.body.classList.toggle('is-veille', rt.r==='veille'||rt.r==='legislatif');
      document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x.dataset.r===rt.r));
      renderSubtabs(rt.r);
      const show = rt.soon ? ['soon'] : [v];
      VIEWS_ALL.forEach(k=>{ document.getElementById('v-'+k).hidden = !show.includes(k); });
      document.getElementById('v-soon').classList.remove('view'); void document.getElementById('v-soon').offsetWidth; document.getElementById('v-soon').classList.add('view');
      if(rt.soon){ document.getElementById('soonTitle').textContent = rt.l; document.getElementById('soonRub').textContent = NAV[rt.r].label; }
      try{ history.replaceState(null,'','#'+v); }catch(e){}
      if(rt.r==='elections') renderElecIntro(v);
      if(v==='leg22'){ renderL22(); renderCmp2224(); setTimeout(()=>{renderMap22(); chart22&&chart22.resize();},0);}
      else if(v==='leg24'){ renderL24(); renderCmp24(); setTimeout(()=>{renderMap24(); chart24.resize();},0);}
      else if(v==='dep'){ setTimeout(()=>{ renderDep(); chartDep&&chartDep.resize(); },0); }
      else if(v==='sim'){ setTimeout(()=>{ renderSim(); chartSim&&chartSim.resize(); },0); }
      else if(v==='cfde'){ renderProj(); setTimeout(()=>{ if(MAP_DIRTY||!chart) renderMap(MAP_KEEP); chart&&chart.resize(); },0); }
      else if(v==='rep-cfde'||v==='cafe'||v==='sen'){ renderDir(v); }
      else if(v==='legislatif'){ const frame=document.getElementById('legislatifFrame'); if(!frame.getAttribute('src')) frame.src=frame.dataset.src; }
      else if(rt.r==='veille'){ if(window.VEILLE) VEILLE.render(v); }
      else if(v==='home'){ renderHomePanel(); setTimeout(()=>{ if(!HOME_INITIALIZED){ HOME_INITIALIZED=true; setHomeMode('3d'); } renderMapHome(); chartHome&&chartHome.resize(); },0); }
    }
    document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; const r=b.dataset.r; showTab(ROUTE[CUR_ROUTE].r===r ? CUR_ROUTE : (r==='accueil'?'home':r==='elections'?'cfde':r==='veille'?'veille':r==='legislatif'?'legislatif':'rep-cfde'));});
    document.getElementById('subtabs').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; showTab(b.dataset.v);});
    document.getElementById('rsComptes').addEventListener('click',()=>showTab('veille-comptes'));
    document.getElementById('rsRetour').addEventListener('click',()=>showTab('veille'));
    window.addEventListener('message', e=>{const frame=document.getElementById('legislatifFrame'); if(e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.type!=='fde-legislatif-height')return; const height=Number(e.data.height); if(Number.isFinite(height)&&height>=100&&height<=100000) frame.style.height=Math.ceil(height)+'px';});
    renderSubtabs('accueil');


    // =====================================================================
    // ---------- Députés des Français de l'étranger ----------
    // =====================================================================
    let DEP = null, SELDEP = 1, chartDep = null;
    try { const r = await fetch('./data/deputes-2026.json'); if (r.ok) DEP = await r.json(); } catch(e) {}
    const GRP_COL = {"Ensemble pour la République":BLOCS.ENS.c, "Les Démocrates":"#C8691C", "Écologiste et Social":BLOCS.ECO.c};
    const grpColor = g => GRP_COL[g] || BLOCS.IND.c;
    const fmtDate = s => new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    const ficheUrl = d => 'https://www.assemblee-nationale.fr/dyn/deputes/'+d.pa;
    // Portrait officiel : fichier local s'il existe, sinon silhouette neutre ; le crédit ne s'affiche qu'avec une vraie photo
    const portraitHTML = (src, alt, credit, cls) => `<figure class="portrait ${cls}"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" onload="if(!this.classList.contains('neutral'))this.parentNode.classList.add('has-photo')" onerror="this.onerror=null;this.classList.add('neutral');this.alt='Photographie non disponible';this.src='./assets/depute-neutre.svg'"><figcaption>${credit}</figcaption></figure>`;
    const photoHTML = (d,cls) => portraitHTML(`./assets/deputes/${d.pa}.jpg`, `Portrait officiel de ${d.prenom} ${d.nom}`, '© Assemblée nationale', cls);
    function depResults(d){
      const L = L24[d.g-1]; const t1=L.cands.reduce((a,c)=>a+c.v1,0); const fin=L.cands.filter(c=>c.v2).sort((a,b)=>b.v2-a.v2); const t2=fin.reduce((a,c)=>a+c.v2,0);
      const top=L.cands.slice().sort((a,b)=>b.v1-a.v1).slice(0,4);
      let h = `<div class="histtag">Historique · législatives 2024</div>
        <div class="small">Inscrits ${fmt(L.ins)} · participation ${L.p1.toLocaleString('fr-FR')} % (1er tour), ${L.p2.toLocaleString('fr-FR')} % (2nd tour)</div>
        <table class="mini"><thead><tr><th>1er tour</th><th class="num">Voix</th><th class="num">%</th></tr></thead><tbody>${top.map(c=>`<tr><td><span class="sw" style="background:${BLOCS[c.b].c}"></span>${c.n} <span class="small">${short(c.lab)}</span></td><td class="num">${fmt(c.v1)}</td><td class="num">${pct(c.v1/t1)}</td></tr>`).join('')}</tbody></table>
        <table class="mini"><thead><tr><th>2nd tour</th><th class="num">Voix</th><th class="num">%</th></tr></thead><tbody>${fin.map(c=>`<tr><td><span class="sw" style="background:${BLOCS[c.b].c}"></span>${c.n}${c.e?' <b class="elu-b">élu(e)</b>':''}</td><td class="num">${fmt(c.v2)}</td><td class="num">${pct(c.v2/t2)}</td></tr>`).join('')}</tbody></table>`;
      if (d.partielle){ const p=d.partielle; h += `<div class="histtag" style="margin-top:10px">Historique · législative partielle du ${fmtDate(p.date)}</div>
        <table class="mini"><thead><tr><th>2nd tour</th><th class="num">%</th></tr></thead><tbody>${p.t2.map(c=>`<tr><td><span class="sw" style="background:${BLOCS[c.b].c}"></span>${c.n} <span class="small">${c.lab}</span></td><td class="num">${c.p.toLocaleString('fr-FR')} %</td></tr>`).join('')}</tbody></table>
        <div class="small">1er tour : ${p.t1.map(c=>c.n+' '+c.p.toLocaleString('fr-FR')+' %').join(', ')}. ${p.note}</div>`; }
      return h;
    }
    function depCard(d, big){
      return `<div class="glass depcard ${!big&&SELDEP===d.g?'sel':''} ${big?'big':''}" data-g="${d.g}">
        <div class="dep-top">${photoHTML(d,'dep-photo')}
          <div class="dep-id"><div class="dep-circ">${ORD(d.g)} circonscription</div><h4>${d.prenom} <span class="up-name">${d.nom}</span></h4>
          <div class="small">${LEG[d.g]}</div></div></div>
        <dl class="dep-dl">
          <dt>Groupe parlementaire</dt><dd><span class="sw" style="background:${grpColor(d.groupe)}"></span>${d.groupe}${d.lien_groupe!=='membre'?` <span class="small">(${d.lien_groupe})</span>`:''}</dd>
          <dt>Affiliation politique</dt><dd>${d.financement} <span class="small">· rattachement financier déclaré</span></dd>
          <dt>Mandat</dt><dd>${d.mode}, depuis le ${fmtDate(d.debut)}</dd>
        </dl>
        ${big?depResults(d):`<div class="small dep-last">2024 : ${d.elu2024} élu(e) au 2nd tour</div>`}
        ${big&&window.VEILLE&&VEILLE.has(d.pa)?VEILLE.socialBlock(d.pa):''}
        <a class="dep-link" href="${ficheUrl(d)}" target="_blank" rel="noopener">Fiche officielle à l'Assemblée nationale ↗</a>
      </div>`;
    }
    function renderDep(){
      if(!DEP){ document.getElementById('depgrid').innerHTML='<div class="glass notes">Le fichier data/deputes-2026.json est introuvable.</div>'; return; }
      document.getElementById('depSrc').textContent = `Député actuellement en fonction dans chacune des 11 circonscriptions, d'après les fiches officielles de l'Assemblée nationale (vérifiées le ${fmtDate(DEP.maj)}). Cliquez sur la carte ou sur une fiche.`;
      const dq=nrmD(document.getElementById('depQ').value), dg=document.getElementById('depG').value;
      const dl=DEP.deputes.filter(d=>(!dg||d.groupe===dg)&&(!dq||dq.split(/\s+/).every(w=>nrmD(d.prenom+' '+d.nom+' '+LEG[d.g]+' '+ORD(d.g)+' '+d.groupe+' '+d.financement).includes(w))));
      document.getElementById('depCount').textContent = dl.length+' député'+(dl.length>1?'s':'')+' sur 11';
      document.getElementById('depgrid').innerHTML = dl.length ? dl.map(d=>depCard(d,false)).join('') : '<div class="glass notes">Aucun député ne correspond à ces critères.</div>';
      document.querySelectorAll('#depgrid .depcard').forEach(c=>c.addEventListener('click',e=>{ if(e.target.closest('a')) return; selectDep(+c.dataset.g, true); }));
      document.getElementById('deppanel').innerHTML = depCard(DEP.deputes[SELDEP-1], true).replace('glass depcard','depcard');
      renderMapDep();
    }
    function renderMapDep(){
      if(document.getElementById('depMapGrid').hidden) return;
      if(!chartDep){ chartDep=echarts.init(document.getElementById('mapdep')); chartDep.on('click',p=>{const g=COUNTRY_LEG[p.name]||(p.seriesType==='scatter'&&p.data&&p.data.g); if(g) selectDep(g,false);}); window.addEventListener('resize',()=>chartDep&&chartDep.resize()); }
      const byG={}; DEP.deputes.forEach(d=>byG[d.g]=d);
      chartDep.setOption({
        tooltip:{trigger:'item', confine:true, backgroundColor:'rgba(24,33,45,.9)', borderWidth:0, padding:[8,11], extraCssText:'border-radius:10px;', textStyle:{color:'#fff',fontSize:12,fontFamily:'Inter'},
          formatter:p=>{const g=COUNTRY_LEG[p.name]; if(!g) return p.name; const d=byG[g]; return `<b>${ORD(g)} circonscription</b> · ${p.name}<br>${d.civ} ${d.prenom} ${d.nom}<br><span style="opacity:.75">${d.groupe}</span>`;}},
        geo:{map:'world', roam:true, center:[20,22], zoom:1.15, scaleLimit:{min:1,max:10}, itemStyle:{areaColor:'#f1f4f8', borderColor:'#ffffff', borderWidth:.5}, emphasis:{label:{show:false}}, label:{show:false},
          regions: legRegions(g=>({area:grpColor(byG[g].groupe), op: SELDEP===g?1:0.62}))},
        series: legLayers({w:1.3})
      }, true);
      const used=[...new Set(DEP.deputes.map(d=>d.groupe))];
      document.getElementById('legenddep').innerHTML = used.map(g=>`<span><span class="sq" style="background:${grpColor(g)}"></span>${g}</span>`).join('')+'<span class="hint">Couleur : groupe parlementaire du député en fonction. Circonscription sélectionnée en couleur pleine, les autres atténuées.</span>';
    }
    function selectDep(g, scroll){
      SELDEP=g; renderDep();
      if(scroll && !document.getElementById('depMapGrid').hidden) document.getElementById('deppanel').scrollIntoView({behavior:'smooth',block:'center'});
      if(scroll && document.getElementById('depMapGrid').hidden){ const c=document.querySelector('#depgrid .depcard[data-g="'+g+'"]'); if(c) c.scrollIntoView({behavior:'smooth',block:'center'}); }
    }
    const nrmD=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(DEP){ const gs=[...new Set(DEP.deputes.map(d=>d.groupe))]; document.getElementById('depG').innerHTML='<option value="">Tous les groupes</option>'+gs.map(g=>`<option>${g}</option>`).join('');
      document.getElementById('depQ').addEventListener('input',renderDep); document.getElementById('depG').addEventListener('change',renderDep); }
    segs('depView', v=>{ document.getElementById('depMapGrid').hidden = v==='cards'; if(v!=='cards') setTimeout(()=>{renderMapDep(); chartDep&&chartDep.resize();},0); });

    // =====================================================================
    // ---------- Annuaires : CFDE, conseillers AFE, sénateurs ----------
    // =====================================================================
    const getJSON = async u => { try{ const r=await fetch(u); return r.ok ? await r.json() : null; }catch(e){ return null; } };
    const [RCF, RAF, RSE] = await Promise.all([getJSON('./data/cfde-2026.json'), getJSON('./data/cafe-2026.json'), getJSON('./data/senateurs-2026.json')]);
    const nrm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const esc = s => String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const ini = (p,n) => esc(((p||'').trim()[0]||'')+((n||'').trim()[0]||'')).toUpperCase();
    const fullName = r => `${esc(r.prenom)} <span class="up-name">${esc(r.nom)}</span>`;
    const matchAll = (q,txt) => { const s=nrm(q).trim(); if(!s) return true; const t=nrm(txt); return s.split(/\s+/).every(w=>t.includes(w)); };
    const optList = (arr, all) => `<option value="">${all}</option>`+arr.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
    const PAGE = 48;
    const DIRSTATE = {'rep-cfde':{n:PAGE}, cafe:{n:PAGE}, sen:{n:PAGE}};
    const dirFail = (id,f) => { document.getElementById(id).innerHTML = `<div class="glass notes">Le fichier data/${f} est introuvable.</div>`; };

    // --- CFDE ---
    const CF = RCF ? RCF.conseillers.map((r,i)=>{ const c=DATA[r.circ]; const l=c.lists.find(x=>x.n===r.liste)||{name:'—',b:'IND'};
      return Object.assign({i, c, l, bloc: blocOf(c,l)}, r); }) : [];
    const afeById = {}; if(RAF) RAF.conseillers.forEach(a=>afeById[a.id]=a);
    const cfdeByAfe = {}; CF.forEach(r=>{ if(r.afe) cfdeByAfe[r.afe]=r; });
    const presLbl = r => r.pres ? (afeById[r.afe] ? (afeById[r.afe].civ==='Mme'?'Présidente':'Président') : 'Président(e)')+' du conseil consulaire'+(typeof r.pres==='string'?' ('+esc(r.pres)+')':'') : '';
    const afeLbl = r => r.afe ? (afeById[r.afe] && afeById[r.afe].civ==='Mme' ? 'Conseillère' : 'Conseiller')+' à l\'AFE' : '';
    function cfdeCard(r){
      return `<button type="button" class="glass rcard" data-k="cfde" data-i="${r.i}">
        <span class="avatar" style="--a:${BLOCS[r.bloc].c}">${ini(r.prenom,r.nom)}</span>
        <span class="rc-body"><span class="rc-name">${fullName(r)}</span>
          <span class="rc-sub">${esc(r.c.name)}</span>
          <span class="rc-meta"><span class="sw" style="background:${BLOCS[r.bloc].c}"></span>${esc(r.l.name)}</span>
          ${r.pres||r.afe?`<span class="badges">${r.pres?`<span class="badge pres">${presLbl(r)}</span>`:''}${r.afe?`<span class="badge afe">${afeLbl(r)}</span>`:''}</span>`:''}
        </span></button>`;
    }
    function initCfdeFilters(){
      const legSel=document.getElementById('cfLeg'), cSel=document.getElementById('cfCirc');
      legSel.innerHTML = optList(Object.keys(LEG).map(g=>[g, ORD(+g)+' circ. – '+LEG[g]]), 'Toutes les circonscriptions législatives');
      const fillC = () => { const g=+legSel.value; cSel.innerHTML = optList(DATA.filter(c=>!g||c.leg===g).slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(c=>[c.id,c.name]), 'Toutes les circonscriptions consulaires'); };
      fillC();
      document.getElementById('cfBloc').innerHTML = optList(ORDER.map(b=>[b,BLOCS[b].n]), 'Toutes les couleurs politiques');
      legSel.addEventListener('change',()=>{ fillC(); DIRSTATE['rep-cfde'].n=PAGE; renderCfde(); });
      ['cfQ','cfCirc','cfBloc','cfRole','cfSort'].forEach(id=>document.getElementById(id).addEventListener(id==='cfQ'?'input':'change',()=>{ DIRSTATE['rep-cfde'].n=PAGE; renderCfde(); }));
    }
    function renderCfde(){
      if(!RCF){ dirFail('cfGrid','cfde-2026.json'); return; }
      const q=document.getElementById('cfQ').value, g=+document.getElementById('cfLeg').value, ci=document.getElementById('cfCirc').value, b=document.getElementById('cfBloc').value, role=document.getElementById('cfRole').value, sort=document.getElementById('cfSort').value;
      let L = CF.filter(r=>(!g||r.c.leg===g)&&(ci===''||r.circ===+ci)&&(!b||r.bloc===b)&&(!role||(role==='pres'?r.pres:r.afe))&&matchAll(q, r.prenom+' '+r.nom+' '+r.c.name+' '+r.c.posts+' '+r.l.name));
      L = L.slice().sort(sort==='nom' ? (x,y)=>x.nom.localeCompare(y.nom,'fr')||x.prenom.localeCompare(y.prenom,'fr') : (x,y)=>x.c.name.localeCompare(y.c.name,'fr')||x.l.n-y.l.n||x.nom.localeCompare(y.nom,'fr'));
      const n=DIRSTATE['rep-cfde'].n;
      document.getElementById('cfCount').textContent = `${fmt(L.length)} conseiller${L.length>1?'s':''} sur ${fmt(CF.length)}`;
      document.getElementById('cfGrid').innerHTML = L.length ? L.slice(0,n).map(cfdeCard).join('') : '<div class="glass notes">Aucun conseiller ne correspond à ces critères.</div>';
      const more=document.getElementById('cfMore'); more.hidden = L.length<=n; more.textContent = `Afficher plus (${fmt(L.length-n)} restants)`;
    }
    function cfdeFiche(r){
      const others = CF.filter(x=>x.circ===r.circ && x!==r);
      const srcs = (RCF.circonscriptions[r.circ]||{}).pres_src;
      return `<div class="fiche-head"><span class="avatar big" style="--a:${BLOCS[r.bloc].c}">${ini(r.prenom,r.nom)}</span>
          <div><div class="dep-circ">Conseiller(e) des Français de l'étranger · 2026</div><h4 id="ficheTitle">${fullName(r)}</h4>
          ${r.pres||r.afe?`<div class="badges">${r.pres?`<span class="badge pres">${presLbl(r)}</span>`:''}${r.afe?`<span class="badge afe">${afeLbl(r)}</span>`:''}</div>`:''}</div></div>
        <dl class="dep-dl">
          <dt>Circonscription consulaire</dt><dd>${esc(r.c.name)}</dd>
          <dt>Postes</dt><dd>${esc(r.c.posts)}</dd>
          <dt>Circonscription législative</dt><dd>${ORD(r.c.leg)} – ${LEG[r.c.leg]}</dd>
          <dt>Liste d'élection</dt><dd>Liste n° ${r.l.n} · ${esc(r.l.name)}</dd>
          <dt>Couleur politique</dt><dd><span class="sw" style="background:${BLOCS[r.bloc].c}"></span>${BLOCS[r.bloc].n} <span class="small">· classement de l'Observatoire, non officiel</span></dd>
          <dt>Présidence du conseil</dt><dd>${r.pres ? presLbl(r)+(srcs?` <span class="small">· source : ${esc(srcs.join(' ; '))}</span>`:'') : (DATA[r.circ].pres ? 'Non' : '<span class="small">Présidence non renseignée pour ce conseil</span>')}</dd>
          ${r.afe?`<dt>Assemblée des Français de l'étranger</dt><dd><button type="button" class="lnk" data-open="cafe" data-id="${r.afe}">Voir la fiche AFE</button></dd>`:''}
        </dl>
        ${others.length?`<div class="fiche-sec"><div class="histtag">Autres élus de la circonscription</div><div class="chips">${others.map(o=>`<button type="button" class="chip" data-open="cfde" data-id="${o.i}"><span class="sw" style="background:${BLOCS[o.bloc].c}"></span>${esc(o.prenom)} ${esc(o.nom)}</button>`).join('')}</div></div>`:''}
        <div class="small fiche-src">Source : ${esc(RCF.source)}, liste des élus à l'issue du scrutin de mai 2026.</div>`;
    }

    // --- Conseillers à l'AFE ---
    const AF = RAF ? RAF.conseillers : [];
    const KSHORT = {SOC:'Affaires sociales',LOI:'Lois et affaires consulaires',ENS:'Enseignement et culture',SEC:'Sécurité et urgences écologiques',COM:'Commerce extérieur et francophonie',FIN:'Finances et fiscalité'};
    const ROLE_AFE = {bureau:f=>/Bureau de l'AFE|de l'AFE$/.test(f), comm:f=>/de la commission/.test(f), grp:f=>/du groupe/.test(f), any:f=>true};
    function cafeCard(a){
      return `<button type="button" class="glass rcard" data-k="cafe" data-i="${a.id}">
        <span class="avatar neutral">${ini(a.prenom,a.nom)}</span>
        <span class="rc-body"><span class="rc-name">${fullName(a)}</span>
          <span class="rc-sub">${esc(a.circ_afe)}</span>
          <span class="rc-meta">${esc(KSHORT[a.commission]||'')} · ${esc(a.groupe==='NI'?'Non-inscrit':a.groupe==='IND'?'Les Indépendants':a.groupe==='SI'?'Solidaires et Indépendants':a.groupe==='PES'?'Progressistes, Écologistes et Solidaires':a.groupe)}</span>
          ${a.fonctions.length?`<span class="badges">${a.fonctions.map(f=>`<span class="badge ${/AFE/.test(f)?'pres':'afe'}">${esc(f)}</span>`).join('')}</span>`:''}
        </span></button>`;
    }
    function initCafeFilters(){
      document.getElementById('afCirc').innerHTML = optList(RAF.circonscriptions.map(c=>[c,c]), 'Toutes les circonscriptions AFE');
      document.getElementById('afComm').innerHTML = optList(Object.keys(RAF.commissions).map(k=>[k,RAF.commissions[k].replace(/^Commission (des |de la |de l'|du )/,'').replace(/^./,m=>m.toUpperCase())]), 'Toutes les commissions');
      document.getElementById('afGrp').innerHTML = optList(Object.keys(RAF.groupes).map(k=>[k,RAF.groupes[k]]), 'Tous les groupes');
      ['afQ','afCirc','afComm','afGrp','afRole'].forEach(id=>document.getElementById(id).addEventListener(id==='afQ'?'input':'change',()=>{ DIRSTATE.cafe.n=PAGE; renderCafe(); }));
    }
    function renderCafe(){
      if(!RAF){ dirFail('afGrid','cafe-2026.json'); return; }
      const q=document.getElementById('afQ').value, ci=document.getElementById('afCirc').value, k=document.getElementById('afComm').value, g=document.getElementById('afGrp').value, role=document.getElementById('afRole').value;
      const L = AF.filter(a=>(!ci||a.circ_afe===ci)&&(!k||a.commission===k)&&(!g||a.groupe===g)&&(!role||a.fonctions.some(ROLE_AFE[role]))&&matchAll(q, a.prenom+' '+a.nom+' '+a.circ_afe+' '+(cfdeByAfe[a.id]?cfdeByAfe[a.id].c.name+' '+cfdeByAfe[a.id].c.posts:'')));
      const n=DIRSTATE.cafe.n;
      document.getElementById('afCount').textContent = `${L.length} conseiller${L.length>1?'s':''} sur ${AF.length}`;
      document.getElementById('afGrid').innerHTML = L.length ? L.slice(0,n).map(cafeCard).join('') : '<div class="glass notes">Aucun conseiller ne correspond à ces critères.</div>';
      const more=document.getElementById('afMore'); more.hidden = L.length<=n; more.textContent = `Afficher plus (${L.length-n} restants)`;
    }
    function cafeFiche(a){
      const r=cfdeByAfe[a.id];
      return `<div class="fiche-head"><span class="avatar big neutral">${ini(a.prenom,a.nom)}</span>
          <div><div class="dep-circ">${a.civ==='Mme'?'Conseillère':'Conseiller'} à l'Assemblée des Français de l'étranger</div><h4 id="ficheTitle">${esc(a.civ)} ${fullName(a)}</h4></div></div>
        <dl class="dep-dl">
          <dt>Circonscription AFE</dt><dd>${esc(a.circ_afe)}</dd>
          <dt>Commission</dt><dd>${esc(RAF.commissions[a.commission]||'—')}</dd>
          <dt>Groupe</dt><dd>${esc(RAF.groupes[a.groupe]||a.groupe)}</dd>
          <dt>Fonctions</dt><dd>${a.fonctions.length?a.fonctions.map(esc).join('<br>'):'<span class="small">Aucune fonction particulière indiquée</span>'}</dd>
          ${a.mandats.length?`<dt>Représentation</dt><dd>${a.mandats.map(esc).join('<br>')}</dd>`:''}
          ${r?`<dt>Mandat de CFDE</dt><dd>${esc(r.c.name)} · liste ${esc(r.l.name)} <button type="button" class="lnk" data-open="cfde" data-id="${r.i}">Fiche CFDE</button></dd>`:''}
        </dl>
        <a class="dep-link" href="${RAF.url_fiche}${a.id}" target="_blank" rel="noopener">Fiche officielle sur le site de l'AFE ↗</a>
        <div class="small fiche-src">Source : ${esc(RAF.source)}, consulté le ${fmtDate(RAF.maj)}.</div>`;
    }

    // --- Sénateurs ---
    const SEN = RSE ? RSE.senateurs : [];
    const SGRP_COL = {SER:BLOCS.GAU.c, GEST:BLOCS.ECO.c, RDPI:BLOCS.ENS.c, UC:'#4F86C6', RDSE:'#8C6BB1', LR:BLOCS.LR.c};
    const SCOMM = s => s.commission.replace(/^(Membre|Secrétaire|Vice-Présidente?|Présidente?) de la /,'').replace(/^commission (des |de la |de l')/,'');
    const senPhoto = (s,cls) => portraitHTML(`./assets/senateurs/${s.slug}.jpg`, `Portrait officiel de ${esc(s.prenom)} ${esc(s.nom)}`, '© Sénat', cls);
    function senCard(s, big){
      const G=RSE.groupes[s.groupe];
      return `<div class="glass depcard ${big?'big':''}" ${big?'':`role="button" tabindex="0" data-k="sen" data-i="${s.slug}"`}>
        <div class="dep-top">${senPhoto(s,'dep-photo')}
          <div class="dep-id"><div class="dep-circ">Série ${s.serie} · mandat jusqu'en ${s.fin_mandat}</div><h4 ${big?'id="ficheTitle"':''}>${fullName(s)}</h4>
          <div class="small">${s.civ==='Mme'?'Sénatrice':'Sénateur'} représentant les Français établis hors de France</div></div></div>
        <dl class="dep-dl">
          <dt>Groupe politique</dt><dd><span class="sw" style="background:${SGRP_COL[s.groupe]}"></span>${esc(G)}${s.lien_groupe!=='Membre'?` <span class="small">(${esc(s.lien_groupe.toLowerCase())})</span>`:''}</dd>
          <dt>Commission</dt><dd>${esc(big?s.commission:SCOMM(s).replace(/^./,m=>m.toUpperCase()))}</dd>
          ${big&&s.fonctions.length?`<dt>Autres fonctions</dt><dd>${s.fonctions.map(esc).join('<br>')}</dd>`:''}
          ${big?`<dt>Mandat</dt><dd>${esc(s.mandat)}</dd>`:''}
        </dl>
        <a class="dep-link" href="${s.fiche}" target="_blank" rel="noopener">Fiche officielle au Sénat ↗</a>
        ${big&&window.VEILLE&&VEILLE.has(s.slug)?VEILLE.socialBlock(s.slug):''}
        ${big?`<div class="small fiche-src">Source : ${esc(RSE.source)}.</div>`:''}
      </div>`;
    }
    function initSenFilters(){
      document.getElementById('seGrp').innerHTML = optList(Object.keys(RSE.groupes).map(k=>[k,RSE.groupes[k]]), 'Tous les groupes');
      const cs=[...new Set(SEN.map(SCOMM))].sort(); document.getElementById('seComm').innerHTML = optList(cs.map(c=>[c,c.replace(/^./,m=>m.toUpperCase())]), 'Toutes les commissions');
      ['seQ','seGrp','seSerie','seComm'].forEach(id=>document.getElementById(id).addEventListener(id==='seQ'?'input':'change',renderSen));
    }
    function renderSen(){
      if(!RSE){ dirFail('seGrid','senateurs-2026.json'); return; }
      const q=document.getElementById('seQ').value, g=document.getElementById('seGrp').value, se=document.getElementById('seSerie').value, k=document.getElementById('seComm').value;
      const L = SEN.filter(s=>(!g||s.groupe===g)&&(!se||s.serie===+se)&&(!k||SCOMM(s)===k)&&matchAll(q, s.prenom+' '+s.nom+' '+RSE.groupes[s.groupe]+' '+s.commission+' francais etablis hors de france'));
      document.getElementById('seCount').textContent = `${L.length} sénateur${L.length>1?'s':''} sur ${SEN.length}`;
      const cnt={}; SEN.forEach(s=>cnt[s.groupe]=(cnt[s.groupe]||0)+1);
      document.getElementById('seBar').innerHTML = `<div class="bar">${Object.keys(RSE.groupes).map(k=>`<span style="flex:${cnt[k]||0};background:${SGRP_COL[k]}" title="${esc(RSE.groupes[k])} : ${cnt[k]||0}"></span>`).join('')}</div><div class="lg">${Object.keys(RSE.groupes).map(k=>`<span><span class="sq" style="background:${SGRP_COL[k]}"></span>${esc(RSE.groupes[k])} <b>${cnt[k]||0}</b></span>`).join('')}</div>`;
      document.getElementById('seGrid').innerHTML = L.length ? L.map(s=>senCard(s,false)).join('') : '<div class="glass notes">Aucun sénateur ne correspond à ces critères.</div>';
    }

    // --- Fiche individuelle (fenêtre) ---
    const modal=document.getElementById('fiche'), mbody=document.getElementById('ficheBody'); let lastFocus=null;
    function openFiche(k, id){
      let h='';
      if(k==='cfde' && CF[+id]) h=cfdeFiche(CF[+id]);
      else if(k==='cafe' && afeById[+id]) h=cafeFiche(afeById[+id]);
      else if(k==='sen'){ const s=SEN.find(x=>x.slug===id); if(s) h=senCard(s,true).replace('glass depcard','depcard'); }
      else if(k==='dep' && DEP){ const d=DEP.deputes.find(x=>x.g===+id); if(d) h=depCard(d,true).replace('glass depcard','depcard').replace('<h4>','<h4 id="ficheTitle">'); }
      else if(k==='veille' && window.VEILLE) h=VEILLE.fiche(id);
      if(!h) return;
      if(modal.hidden) lastFocus=document.activeElement;
      mbody.innerHTML=h; modal.hidden=false; document.body.classList.add('modal-open'); mbody.scrollTop=0;
      document.getElementById('ficheClose').focus();
      if(k==='veille') VEILLE.ficheMounted(id);
      else if(/^#veille\//.test(location.hash)) try{ history.replaceState(null,'','#'+CUR_ROUTE); }catch(e){}
    }
    function closeFiche(){ if(/^#veille\//.test(location.hash)) try{ history.replaceState(null,'','#'+CUR_ROUTE); }catch(e){}
      modal.hidden=true; document.body.classList.remove('modal-open'); if(lastFocus&&lastFocus.focus) lastFocus.focus(); }
    document.getElementById('ficheClose').addEventListener('click',closeFiche);
    modal.addEventListener('click',e=>{ if(e.target===modal) return closeFiche(); const b=e.target.closest('[data-open]'); if(b) openFiche(b.dataset.open,b.dataset.id); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!modal.hidden) closeFiche(); });
    // boutons « Veille parlementaire » placés hors de la fenêtre (panneau Députés)
    document.getElementById('deppanel').addEventListener('click',e=>{ const b=e.target.closest('[data-open]'); if(b) openFiche(b.dataset.open,b.dataset.id); });
    ['cfGrid','afGrid','seGrid'].forEach(id=>{ const el=document.getElementById(id);
      el.addEventListener('click',e=>{ if(e.target.closest('a')) return; const c=e.target.closest('[data-k]'); if(c) openFiche(c.dataset.k,c.dataset.i); });
      el.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-k][role=button]')){ e.preventDefault(); openFiche(e.target.dataset.k,e.target.dataset.i); } }); });
    document.getElementById('cfMore').addEventListener('click',()=>{ DIRSTATE['rep-cfde'].n+=PAGE; renderCfde(); });
    document.getElementById('afMore').addEventListener('click',()=>{ DIRSTATE.cafe.n+=PAGE; renderCafe(); });
    if(RCF) initCfdeFilters(); if(RAF) initCafeFilters(); if(RSE) initSenFilters();
    if(RCF){ const np=CF.filter(r=>r.pres).length, nc=DATA.filter(c=>c.pres).length;
      document.getElementById('cfSrc').textContent = `Les ${fmt(CF.length)} conseillers élus en mai 2026 dans les 130 circonscriptions consulaires, d'après le tableau officiel des élus du ministère de l'Europe et des Affaires étrangères. Présidence renseignée pour ${nc} conseils sur 130 (${np} présidents), à partir des communications publiques des postes et de la presse locale.`; }
    if(RAF) document.getElementById('afSrc').textContent = `Les ${AF.length} conseillers élus à l'Assemblée des Français de l'étranger, d'après l'annuaire officiel de l'AFE (consulté le ${fmtDate(RAF.maj)}).`;
    if(RSE) document.getElementById('seSrc').textContent = `Les ${SEN.length} sénateurs représentant les Français établis hors de France, après le renouvellement de septembre 2026, d'après le site du Sénat (consulté le ${fmtDate(RSE.maj)}).`;
    function renderDir(v){ if(v==='rep-cfde') renderCfde(); else if(v==='cafe') renderCafe(); else renderSen(); }

    // =====================================================================
    // ---------- Simulateur de sièges 2027 ----------
    // =====================================================================
    const SB = ['LFI','GAU','ECO','ENS','LR','ED','IND'];           // blocs du mode avancé
    const SBS = ['G','ENS','LR','ED','IND'];                          // blocs du mode simple
    const SNAME = {G:'Gauche unie (LFI, PS, Écologistes)', LFI:'LFI', GAU:'PS / gauche', ECO:'Écologistes', ENS:'Bloc central', LR:'Droite (LR)', ED:'RN / extrême droite', IND:'Autres candidats'};
    const SCOL = b => b==='G' ? BLOCS.GAU.c : BLOCS[b].c;
    const LEFT = ['LFI','GAU','ECO','G'];
    const r1 = x => Math.round(x*10)/10;
    function defaultReports(){
      const R={}; const all=['G',...SB];
      all.forEach(f=>{ R[f]={}; all.forEach(t=>{ R[f][t]=0; }); });
      const set=(fs,ts,v)=>fs.forEach(f=>ts.forEach(t=>{ if(f!==t) R[f][t]=v; }));
      set(LEFT,LEFT,85); set(LEFT,['ENS'],45); set(LEFT,['LR'],5); set(LEFT,['ED'],3);
      set(['ENS'],LEFT,30); set(['ENS'],['LR'],50); set(['ENS'],['ED'],5);
      set(['LR'],['ENS'],60); set(['LR'],LEFT,10); set(['LR'],['ED'],20);
      set(['ED'],['LR'],50); set(['ED'],['ENS'],20); set(['ED'],LEFT,5);
      set(['IND'],LEFT,30); set(['IND'],['ENS'],30); set(['IND'],['LR'],15); set(['IND'],['ED'],10);
      return R;
    }
    const blocsFor = mode => mode==='simple' ? SBS : SB;
    // --- Candidatures : état par circonscription = liste de candidatures (bloc + % des exprimés) ---
    const SAME_BLOC_REPORT = 90;   // report entre deux candidatures d'un même bloc (hypothèse)
    const effB = (b, mode) => mode==='simple' && ['LFI','GAU','ECO'].includes(b) ? 'G' : b;
    let CID = 1;
    const newId = () => 'c'+(Date.now().toString(36))+(CID++);
    function histBlank(d){ const s=d.cands.reduce((a,c)=>a+c.v1,0), v=d.ins*d.p1/100, b=(1-s/v)*100; return (b>=0&&b<=20) ? Math.round(b*100)/100 : 1.5; }
    function defaultState(){
      const circ={};
      L24.forEach(d=>{ const t=d.cands.reduce((a,c)=>a+c.v1,0);
        const cands=d.cands.slice().sort((a,b)=>b.v1-a.v1).map(c=>({id:newId(), n:c.n, b:c.b, pc:c.v1/t*100}));
        circ[d.g]={cands, p1:d.p1, p2:d.p2, blank:histBlank(d), hist:true}; });
      const des={}; ['G',...SB].forEach(b=>des[b]= b!=='ED');
      return {v:2, mode:'simple', cur:1, circ, des, rep:defaultReports()};
    }
    // conversion des scénarios enregistrés avec l'ancien format (un score par bloc)
    function migrateState(s){
      if(!s||!s.circ) return s;
      Object.keys(s.circ).forEach(g=>{ const st=s.circ[g];
        if(!st.cands){ st.cands = SB.filter(b=>st.s&&st.s[b]>0).map(b=>({id:newId(), n:'Candidature '+SNAME[b].split(' (')[0], b, pc:st.s[b]})); delete st.s; }
        if(st.blank==null) st.blank=1.5; });
      s.v=2; return s;
    }
    // voix entières : votants, exprimés et voix des candidatures (arrondis cohérents)
    function voteBase(g, st){
      const ins=L24[g-1].ins, vot=Math.round(ins*st.p1/100), exp=Math.round(vot*(1-st.blank/100));
      return {ins, vot, exp};
    }
    function candVotes(st, exp){
      // plus forts restes : total attribué = arrondi(exprimés × somme des %), jamais au-delà des exprimés
      const raw=st.cands.map(c=>exp*c.pc/100), v=raw.map(x=>Math.floor(x+1e-7));
      const target=Math.min(exp, Math.round(raw.reduce((a,x)=>a+x,0)));
      let left=target-v.reduce((a,x)=>a+x,0);
      const ord=raw.map((x,i)=>[x-v[i],i]).sort((a,b)=>b[0]-a[0]);
      for(let k=0;left>0&&k<ord.length;k++){ v[ord[k][1]]++; left--; }
      return v;
    }
    function sumPc(st, exceptId){ return st.cands.reduce((a,c)=>a+(c.id===exceptId?0:c.pc),0); }
    function simulateCirc(g, state){
      const st=state.circ[g], mode=state.mode;
      const {ins, vot, exp} = voteBase(g, st);
      const vv=candVotes(st, exp);
      const cands=st.cands.map((c,i)=>({id:c.id, n:c.n, b:c.b, eb:effB(c.b,mode), v1:vv[i]})).filter(c=>c.v1>0);
      const other=exp-vv.reduce((a,x)=>a+x,0);
      const order=cands.slice().sort((a,b)=>b.v1-a.v1);
      const need1=Math.floor(exp/2)+1, need25=Math.ceil(ins*0.25), needQ=Math.ceil(ins*0.125);
      const res={g, ins, vot, exp1:exp, other, cands:order, need1, need25, needQ};
      const lead=order[0];
      if(!lead){ res.winner='IND'; res.empty=true; res.finalists=[]; res.withdrawn=[]; res.v2={}; res.exp2=0; return res; }
      if(lead.v1>=need1 && lead.v1>=need25){ res.t1win=lead; res.winner=lead.eb; res.wcand=lead; return res; }
      let q=order.filter(c=>c.v1>=needQ); if(q.length<2) q=order.slice(0,2);
      res.qualified=q.map(c=>c.id);
      let fin=q.slice(0,2).concat(q.slice(2).filter(c=>!state.des[c.eb]));
      res.withdrawn=q.filter(c=>!fin.includes(c));
      res.finalists=fin;
      const k=st.p2/st.p1, v2={}; fin.forEach(f=>v2[f.id]=f.v1*k);
      const share=(fromB, f)=>{ if(fromB===f.eb) return SAME_BLOC_REPORT; return state.rep[fromB]&&state.rep[fromB][f.eb]||0; };
      const give=(fromB, votes)=>{
        // part du report vers chaque bloc finaliste, répartie entre finalistes d'un même bloc au prorata de leurs voix
        const byB={}; fin.forEach(f=>{ (byB[f.eb]=byB[f.eb]||[]).push(f); });
        let tot=Object.keys(byB).reduce((a,b)=>a+share(fromB, byB[b][0]),0); const scale=tot>100?100/tot:1;
        Object.values(byB).forEach(list=>{ const s=share(fromB,list[0])/100*scale, sv=list.reduce((a,f)=>a+f.v1,0)||1; list.forEach(f=>v2[f.id]+=votes*k*s*f.v1/sv); });
      };
      order.filter(c=>!fin.includes(c)).forEach(c=>give(c.eb, c.v1));
      if(other>0) give('IND', other);
      // voix entières au 2nd tour
      Object.keys(v2).forEach(id=>v2[id]=Math.round(v2[id]));
      res.v2=v2; res.exp2=fin.reduce((a,f)=>a+v2[f.id],0);
      const w=fin.slice().sort((a,b)=>v2[b.id]-v2[a.id]||b.v1-a.v1)[0]; res.wcand=w; res.winner=w.eb;
      return res;
    }
    function simulateAll(state){ const out={}; for(let g=1;g<=11;g++) out[g]=simulateCirc(g,state); return out; }
    function seatCount(results, mode){ const c={}; blocsFor(mode).forEach(b=>c[b]=0); Object.values(results).forEach(r=>c[r.winner]=(c[r.winner]||0)+1); return c; }
    function validCirc(g){ return sumPc(SIM.circ[g]) <= 100.000001; }
    function saveSim(){ try{ localStorage.setItem('obs_sim_state', JSON.stringify(SIM)); }catch(e){} }
    let SIM = defaultState();
    let SAVED = {}; try{ SAVED = JSON.parse(localStorage.getItem('obs_sim_scen')||'{}'); Object.values(SAVED).forEach(migrateState); }catch(e){}
    let chartSim=null;
    try{ const s=JSON.parse(localStorage.getItem('obs_sim_state')||'null'); if(s&&s.circ&&s.rep) SIM=migrateState(s); }catch(e){}

    function renderSim(){
      document.querySelectorAll('#simMode button').forEach(b=>b.classList.toggle('on',b.dataset.v===SIM.mode));
      document.getElementById('v-sim').classList.toggle('is-adv', SIM.mode==='adv');
      const sel=document.getElementById('simCirc');
      if(!sel.options.length) for(let g=1;g<=11;g++) sel.insertAdjacentHTML('beforeend',`<option value="${g}">${ORD(g)} — ${LEG[g]}</option>`);
      sel.value=SIM.cur;
      const st=SIM.circ[SIM.cur];
      simTagUpdate();
      const p1=document.getElementById('simP1'), p2=document.getElementById('simP2'); p1.value=st.p1; p2.value=st.p2;
      document.getElementById('simP1v').textContent=st.p1.toLocaleString('fr-FR')+' %'; document.getElementById('simP2v').textContent=st.p2.toLocaleString('fr-FR')+' %';
      document.getElementById('simBlank').value=st.blank;
      renderCandTable();
      renderSimResults();
      renderHyp();
    }
    function simTagUpdate(){ const st=SIM.circ[SIM.cur]; document.getElementById('simTag').innerHTML = st.hist ? '<span class="histtag">Historique · 1er tour 2024</span>' : '<span class="simtag">Simulation · hypothèses modifiées</span>'; }
    const fmtPc = x => (Math.round(x*100)/100).toLocaleString('fr-FR',{maximumFractionDigits:2});
    // tableau des candidatures : % et voix modifiables et synchronisés
    function renderCandTable(){
      const g=SIM.cur, st=SIM.circ[g], {ins, vot, exp}=voteBase(g, st), vv=candVotes(st, exp);
      const used=vv.reduce((a,x)=>a+x,0), restV=exp-used, restP=exp>0?restV/exp*100:0;
      const blocOpts = b => SB.map(x=>`<option value="${x}" ${x===b?'selected':''}>${SNAME[x].split(' (')[0]}</option>`).join('');
      document.getElementById('simInputs').innerHTML = `
        <div class="simbase"><span>Inscrits <b>${fmt(ins)}</b></span><span>Votants <b>${fmt(vot)}</b></span><span>Exprimés <b>${fmt(exp)}</b></span></div>
        <div class="tblx"><table class="candtbl"><thead><tr><th>Candidature</th><th>Bloc</th><th class="num">Pourcentage</th><th class="num">Nombre de voix</th><th></th></tr></thead><tbody>`+
        st.cands.map((c,i)=>{ const maxP=Math.max(0,100-sumPc(st,c.id)), maxV=vv[i]+restV;
          return `<tr data-id="${c.id}"><td><span class="sw" style="background:${SCOL(c.b)}"></span><input class="cname" value="${esc(c.n)}" aria-label="Nom de la candidature" maxlength="60"></td>
          <td><select class="cbloc" aria-label="Bloc politique">${blocOpts(c.b)}</select></td>
          <td class="num"><input type="number" class="cpc simnum" min="0" max="${fmtPc(maxP).replace(',','.')}" step="0.01" value="${Math.round(c.pc*100)/100}" aria-label="Pourcentage des exprimés"> %</td>
          <td class="num"><input type="number" class="cvo simnum" min="0" max="${maxV}" step="1" value="${vv[i]}" aria-label="Nombre de voix"></td>
          <td><button type="button" class="cdel" aria-label="Supprimer la candidature" title="Supprimer">×</button></td></tr>`; }).join('')+
        `<tr class="rest"><td><span class="sw" style="background:#d5dbe3"></span>Autres / non attribués</td><td class="small">solde</td><td class="num">${fmtPc(restP)} %</td><td class="num">${fmt(restV)}</td><td></td></tr>
        </tbody><tfoot><tr><td colspan="2"><b>Total</b></td><td class="num"><b>100 %</b></td><td class="num"><b>${fmt(exp)}</b></td><td></td></tr></tfoot></table></div>
        <button type="button" class="lnk" id="candAdd">+ Ajouter une candidature</button>`;
      document.getElementById('simTotal').innerHTML = `<span class="small">Exprimés = votants × (1 − blancs et nuls). Chaque saisie est plafonnée aux voix encore disponibles (${fmt(restV)} non attribuées).</span>`;
    }
    function candEdited(){ SIM.circ[SIM.cur].hist=false; saveSim(); renderCandTable(); simTagUpdate(); renderSimResults(); }
    const simInputsEl=document.getElementById('simInputs');
    simInputsEl.addEventListener('change',e=>{
      const tr=e.target.closest('tr[data-id]'); if(!tr) return;
      const st=SIM.circ[SIM.cur], c=st.cands.find(x=>x.id===tr.dataset.id); if(!c) return;
      const {exp}=voteBase(SIM.cur, st);
      if(e.target.classList.contains('cpc')){ const maxP=100-sumPc(st,c.id); c.pc=Math.max(0,Math.min(maxP, +String(e.target.value).replace(',','.')||0)); }
      else if(e.target.classList.contains('cvo')){ const others=candVotes(st,exp).reduce((a,x,i)=>a+(st.cands[i].id===c.id?0:x),0); const v=Math.max(0,Math.min(exp-others, Math.round(+e.target.value||0))); c.pc = exp>0 ? Math.min(v/exp*100, Math.max(0,100-sumPc(st,c.id))) : 0; }
      else if(e.target.classList.contains('cbloc')){ c.b=e.target.value; }
      else if(e.target.classList.contains('cname')){ c.n=e.target.value.trim()||'Candidature'; }
      candEdited();
    });
    simInputsEl.addEventListener('click',e=>{
      const st=SIM.circ[SIM.cur];
      if(e.target.closest('.cdel')){ const id=e.target.closest('tr').dataset.id; st.cands=st.cands.filter(x=>x.id!==id); candEdited(); }
      else if(e.target.id==='candAdd'){ st.cands.push({id:newId(), n:'Nouvelle candidature', b:'IND', pc:0}); candEdited(); const ins=simInputsEl.querySelectorAll('.cname'); const last=ins[ins.length-1]; if(last){ last.focus(); last.select(); } }
    });
    simInputsEl.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.matches('input')) e.target.blur(); });
    function resLine(c,v,tot,extra){ return `<div class="resrow"><span class="sw" style="background:${SCOL(c.eb)}"></span><span class="reslab" title="${esc(c.n)} — ${SNAME[c.eb]}">${esc(c.n)} <span class="small">${SNAME[c.eb].split(' (')[0]}</span>${extra||''}</span><div class="resbar"><div style="width:${tot?v/tot*100:0}%;background:${SCOL(c.eb)}"></div></div><span class="num">${pct(tot?v/tot:0)}<span class="small"> · ${fmt(v)}</span></span></div>`; }
    function renderSimResults(){
      const all=simulateAll(SIM), seats=seatCount(all,SIM.mode), blocs=blocsFor(SIM.mode);
      const invalid=[]; for(let g=1;g<=11;g++) if(!validCirc(g)) invalid.push(ORD(g));
      // résumé des sièges
      const dots = Object.values(all).map(r=>`<span class="seatdot" title="${ORD(r.g)} : ${SNAME[r.winner]}" style="background:${SCOL(r.winner)}"></span>`).join('');
      document.getElementById('simSeats').innerHTML = `<div class="seatdots">${dots}</div>`+
        blocs.filter(b=>seats[b]).sort((a,b)=>seats[b]-seats[a]).map(b=>`<div class="seatrow"><span class="sw" style="background:${SCOL(b)}"></span><span>${SNAME[b]}</span><div class="seatbar"><div style="width:${seats[b]/11*100}%;background:${SCOL(b)}"></div></div><b>${seats[b]}</b></div>`).join('')+
        (invalid.length?`<div class="warn">Total supérieur à 100 % : ${invalid.join(', ')}.</div>`:'');
      // circonscription courante
      const r=all[SIM.cur], st=SIM.circ[SIM.cur];
      let h=`<div class="small">Inscrits ${fmt(r.ins)} · votants ${fmt(r.vot)} · exprimés ${fmt(r.exp1)}</div><div class="resblock"><div class="restitle">1er tour</div>`+
        r.cands.map(c=>resLine(c,c.v1,r.exp1, r.t1win===c?' <span class="qual">élu</span>':(r.qualified&&r.qualified.includes(c.id)?' <span class="qual">qualifié</span>':''))).join('')+
        (r.other>0?`<div class="resrow"><span class="sw" style="background:#d5dbe3"></span><span class="reslab">Autres / non attribués</span><div class="resbar"><div style="width:${r.other/r.exp1*100}%;background:#c3cad3"></div></div><span class="num">${pct(r.other/r.exp1)}<span class="small"> · ${fmt(r.other)}</span></span></div>`:'')+
        `<div class="small">Seuils calculés en voix : élu au 1er tour avec au moins <b>${fmt(r.need1)}</b> voix (majorité absolue des exprimés) et <b>${fmt(r.need25)}</b> voix (25 % des inscrits) ; qualifié pour le 2nd tour avec <b>${fmt(r.needQ)}</b> voix (12,5 % des inscrits), à défaut les deux premiers.</div></div>`;
      if(r.empty){ h+='<div class="warn">Aucune candidature avec des voix dans cette circonscription.</div>'; }
      else if(r.t1win){ h+=`<div class="winner" style="--c:${SCOL(r.winner)}">Élu dès le 1er tour : <b>${esc(r.t1win.n)}</b> (${SNAME[r.winner]})</div>`; }
      else {
        h+=`<div class="resblock"><div class="restitle">2nd tour ${r.finalists.length>2?'(triangulaire)':'(duel)'}</div>`+
          (r.withdrawn.length?`<div class="small">Désistement : ${r.withdrawn.map(c=>esc(c.n)).join(', ')}</div>`:'')+
          r.finalists.slice().sort((a,b)=>r.v2[b.id]-r.v2[a.id]).map(c=>resLine(c,r.v2[c.id],r.exp2)).join('')+
          `<div class="small">Participation au 2nd tour : ${st.p2.toLocaleString('fr-FR')} % ; voix des candidatures éliminées et du solde « autres » réparties selon les reports choisis (${SAME_BLOC_REPORT} % entre candidatures d'un même bloc), le reste s'abstient.</div></div>
          <div class="winner" style="--c:${SCOL(r.winner)}">Siège attribué : <b>${esc(r.wcand.n)}</b> (${SNAME[r.winner]})</div>`;
      }
      document.getElementById('simResult').innerHTML=h;
      // tableau détaillé
      document.getElementById('simTable').innerHTML = `<thead><tr><th>Circonscription</th><th>Statut</th><th>1er tour : en tête</th><th>2nd tour</th><th>Siège simulé</th><th>Officiel 2024</th></tr></thead><tbody>`+
        Object.values(all).map(r=>{ const st=SIM.circ[r.g]; return `<tr data-g="${r.g}" style="cursor:pointer" class="${r.g===SIM.cur?'cur':''}"><td><b>${ORD(r.g)}</b> <span class="small">${LEG[r.g]}</span></td>
        <td>${st.hist?'<span class="histtag">Historique 2024</span>':'<span class="simtag">Simulation</span>'}${validCirc(r.g)?'':' <span class="badv">&gt; 100 %</span>'}</td>
        <td>${r.cands[0]?esc(r.cands[0].n)+' <span class="small">'+SNAME[r.cands[0].eb].split(' (')[0]+'</span> '+pct(r.cands[0].v1/r.exp1)+' <span class="small">('+fmt(r.cands[0].v1)+' voix)</span>':'—'}</td>
        <td>${r.empty?'—':r.t1win?'élu au 1er tour':r.finalists.map(f=>esc(f.n)+' '+pct(r.v2[f.id]/r.exp2)).join(' · ')}</td>
        <td><span class="pill" style="background:${SCOL(r.winner)}">${SNAME[r.winner].split(' (')[0]}</span></td><td>${(e=>`<span class="sw" style="background:${BLOCS[e.b].c}"></span>${e.n} <span class="small">${short(e.lab)}</span>`)(L24[r.g-1].cands.find(c=>c.e))}</td></tr>`;}).join('')+'</tbody>';
      document.querySelectorAll('#simTable tbody tr').forEach(tr=>tr.addEventListener('click',()=>{SIM.cur=+tr.dataset.g; saveSim(); renderSim(); document.querySelector('.simcirc').scrollIntoView({behavior:'smooth',block:'start'});}));
      renderMapSim(all);
      renderCompare();
    }
    function renderMapSim(all){
      if(document.getElementById('v-sim').hidden) return;
      if(!chartSim){ chartSim=echarts.init(document.getElementById('mapsim')); chartSim.on('click',p=>{const g=COUNTRY_LEG[p.name]; if(g){SIM.cur=g; saveSim(); renderSim();}}); window.addEventListener('resize',()=>chartSim&&chartSim.resize()); }
      chartSim.setOption({
        tooltip:{trigger:'item', confine:true, backgroundColor:'rgba(24,33,45,.9)', borderWidth:0, padding:[8,11], extraCssText:'border-radius:10px;', textStyle:{color:'#fff',fontSize:12,fontFamily:'Inter'},
          formatter:p=>{const g=COUNTRY_LEG[p.name]; if(!g) return p.name; const r=all[g]; return `<b>${ORD(g)} circonscription</b> · ${p.name}<br>Simulation : ${r.wcand?r.wcand.n+' – ':''}${SNAME[r.winner]}`;}},
        geo:{map:'world', roam:true, center:[20,22], zoom:1.1, scaleLimit:{min:1,max:10}, itemStyle:{areaColor:'#f1f4f8', borderColor:'#ffffff', borderWidth:.5}, emphasis:{label:{show:false}}, label:{show:false},
          regions: legRegions(g=>({area:SCOL(all[g].winner), op: SIM.cur===g?0.98:0.6}))},
        series: legLayers({w:1.2})
      }, true);
      const used=[...new Set(Object.values(all).map(r=>r.winner))];
      document.getElementById('legendsim').innerHTML = used.map(b=>`<span><span class="sq" style="background:${SCOL(b)}"></span>${SNAME[b]}</span>`).join('')+'<span class="hint">Siège simulé, et non résultat réel. Cliquez sur une circonscription pour la modifier.</span>';
    }
    function renderHyp(){
      const blocs=['G',...SB].filter(b=> SIM.mode==='simple' ? SBS.includes(b) : b!=='G');
      document.getElementById('simDesist').innerHTML = '<div class="small" style="margin:8px 0 4px">Se désiste s\'il est 3e ou au-delà :</div><div class="chips">'+blocs.map(b=>`<label class="chip"><input type="checkbox" data-b="${b}" ${SIM.des[b]?'checked':''}> <span class="sw" style="background:${SCOL(b)}"></span>${SNAME[b].split(' (')[0]}</label>`).join('')+'</div>';
      document.querySelectorAll('#simDesist input').forEach(i=>i.addEventListener('change',()=>{SIM.des[i.dataset.b]=i.checked; saveSim(); renderSimResults();}));
      document.getElementById('simReports').innerHTML = `<thead><tr><th>Voix de ↓ vers →</th>${blocs.map(b=>`<th class="num"><span class="sw" style="background:${SCOL(b)}"></span>${SNAME[b].split(' (')[0]}</th>`).join('')}</tr></thead><tbody>`+
        blocs.map(f=>`<tr><td><span class="sw" style="background:${SCOL(f)}"></span>${SNAME[f].split(' (')[0]}</td>${blocs.map(t=>f===t?'<td class="num small">—</td>':`<td class="num"><input type="number" min="0" max="100" step="1" value="${SIM.rep[f][t]}" data-f="${f}" data-t="${t}" class="repin" ${SIM.mode==='simple'?'disabled':''}> %</td>`).join('')}</tr>`).join('')+'</tbody>';
      document.querySelectorAll('#simReports input').forEach(i=>i.addEventListener('change',()=>{SIM.rep[i.dataset.f][i.dataset.t]=Math.max(0,Math.min(100,+i.value||0)); saveSim(); renderSimResults();}));
    }
    function renderCompare(){
      const names=Object.keys(SAVED);
      const A=document.getElementById('cmpA'), B=document.getElementById('cmpB'); const va=A.value, vb=B.value;
      const opts='<option value="__cur">Scénario en cours</option><option value="__2024">Référence 2024 (historique)</option>'+names.map(n=>`<option value="${n.replace(/"/g,'&quot;')}">${n}</option>`).join('');
      A.innerHTML=opts; B.innerHTML=opts; A.value = va && [...A.options].some(o=>o.value===va) ? va : (names[0]||'__2024'); B.value = vb && [...B.options].some(o=>o.value===vb) ? vb : '__cur';
      const get=v=> v==='__cur'?SIM : v==='__2024'?Object.assign(defaultState(),{mode:SIM.mode}) : SAVED[v];
      const sa=get(A.value), sb=get(B.value); if(!sa||!sb){ document.getElementById('cmpOut').innerHTML=''; return; }
      const ra=simulateAll(sa), rb=simulateAll(sb); const ca=seatCount(ra,sa.mode), cb=seatCount(rb,sb.mode);
      const allb=[...new Set([...Object.keys(ca),...Object.keys(cb)])].filter(b=>(ca[b]||0)+(cb[b]||0)>0);
      const lbl=v=> v==='__cur'?'Scénario en cours':v==='__2024'?'Référence 2024':v;
      document.getElementById('cmpOut').innerHTML = `<table><thead><tr><th>Bloc</th><th class="num">${lbl(A.value)}</th><th class="num">${lbl(B.value)}</th><th class="num">Écart</th></tr></thead><tbody>`+
        allb.map(b=>{const d=(cb[b]||0)-(ca[b]||0); return `<tr><td><span class="sw" style="background:${SCOL(b)}"></span>${SNAME[b]}</td><td class="num">${ca[b]||0}</td><td class="num">${cb[b]||0}</td><td class="num ${d>0?'up':d<0?'down':''}">${d>0?'+':''}${d}</td></tr>`;}).join('')+
        `</tbody></table><table><thead><tr><th>Circonscription</th><th>${lbl(A.value)}</th><th>${lbl(B.value)}</th></tr></thead><tbody>`+
        Array.from({length:11},(_,i)=>i+1).map(g=>{const a=ra[g].winner,b=rb[g].winner; return `<tr ${a!==b?'class="diff"':''}><td>${ORD(g)} <span class="small">${LEG[g]}</span></td><td><span class="pill" style="background:${SCOL(a)}">${SNAME[a].split(' (')[0]}</span></td><td><span class="pill" style="background:${SCOL(b)}">${SNAME[b].split(' (')[0]}</span>${a!==b?' <span class="small">changement</span>':''}</td></tr>`;}).join('')+'</tbody></table>';
    }
    document.getElementById('cmpA').addEventListener('change',renderCompare);
    document.getElementById('cmpB').addEventListener('change',renderCompare);
    document.getElementById('cmpDel').addEventListener('click',()=>{ const v=document.getElementById('cmpA').value; if(SAVED[v]){ delete SAVED[v]; try{localStorage.setItem('obs_sim_scen',JSON.stringify(SAVED));}catch(e){} renderCompare(); document.getElementById('simMsg').textContent='Scénario « '+v+' » supprimé.'; } });
    segs('simMode', v=>{ SIM.mode=v; saveSim(); renderSim(); });
    document.getElementById('simCirc').addEventListener('change',e=>{ SIM.cur=+e.target.value; saveSim(); renderSim(); });
    document.getElementById('simP1').addEventListener('input',e=>{ const st=SIM.circ[SIM.cur]; st.p1=+e.target.value; st.hist=false; document.getElementById('simP1v').textContent=st.p1.toLocaleString('fr-FR')+' %'; saveSim(); renderCandTable(); renderSimResults(); document.getElementById('simTag').innerHTML='<span class="simtag">Simulation · hypothèses modifiées</span>'; });
    document.getElementById('simP2').addEventListener('input',e=>{ const st=SIM.circ[SIM.cur]; st.p2=+e.target.value; st.hist=false; document.getElementById('simP2v').textContent=st.p2.toLocaleString('fr-FR')+' %'; saveSim(); renderSimResults(); document.getElementById('simTag').innerHTML='<span class="simtag">Simulation · hypothèses modifiées</span>'; });
    document.getElementById('simBlank').addEventListener('change',e=>{ const st=SIM.circ[SIM.cur]; st.blank=Math.max(0,Math.min(20,+String(e.target.value).replace(',','.')||0)); st.hist=false; saveSim(); renderSim(); });
    document.getElementById('simReset').addEventListener('click',()=>{ const m=SIM.mode, c=SIM.cur; SIM=defaultState(); SIM.mode=m; SIM.cur=c; saveSim(); renderSim(); document.getElementById('simMsg').textContent='Scénario réinitialisé aux résultats de 2024.'; });
    // fenêtre de saisie du nom (les boîtes de dialogue natives ne sont pas toujours disponibles)
    document.getElementById('simSave').addEventListener('click',()=>{
      const box=document.getElementById('simMsg');
      box.innerHTML='<input id="simName" class="nameinp" placeholder="Nom du scénario" maxlength="40"> <button class="lnk" id="simNameOk">OK</button>';
      const inp=document.getElementById('simName'); inp.focus();
      const ok=()=>{ const n=inp.value.trim(); if(!n){ inp.focus(); return; } SAVED[n]=JSON.parse(JSON.stringify(SIM)); try{localStorage.setItem('obs_sim_scen',JSON.stringify(SAVED));}catch(e){} box.textContent='Scénario « '+n+' » enregistré dans ce navigateur.'; renderCompare(); };
      document.getElementById('simNameOk').addEventListener('click',ok); inp.addEventListener('keydown',e=>{ if(e.key==='Enter') ok(); });
    });
    renderSim();

    // ---------- Recherche rapide (pays, ville, circonscription) ----------
    const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const IDX=[];
    DATA.forEach(c=>IDX.push({type:'cons', label:c.name, sub:c.posts+' · '+ORD(c.leg)+' circ. législative', key:norm(c.name+' '+c.posts), id:c.id}));
    if(DEP) DEP.deputes.forEach(d=>IDX.push({type:'dep', label:d.prenom+' '+d.nom, sub:'Député(e) de la '+ORD(d.g)+' circonscription · '+d.groupe, key:norm(d.prenom+' '+d.nom+' depute '+(d.elu2024||'')), g:d.g}));
    CF.forEach(r=>IDX.push({type:'rcfde', label:r.prenom+' '+r.nom, sub:'CFDE · '+r.c.name+(r.pres?' · présidence du conseil':''), key:norm(r.prenom+' '+r.nom+' cfde conseiller '+r.c.name), i:r.i}));
    AF.forEach(a=>IDX.push({type:'rcafe', label:a.prenom+' '+a.nom, sub:'Conseiller(e) AFE · '+a.circ_afe, key:norm(a.prenom+' '+a.nom+' afe '+a.circ_afe), i:a.id}));
    SEN.forEach(x=>IDX.push({type:'rsen', label:x.prenom+' '+x.nom, sub:(x.civ==='Mme'?'Sénatrice':'Sénateur')+' · '+RSE.groupes[x.groupe], key:norm(x.prenom+' '+x.nom+' senateur senatrice '+RSE.groupes[x.groupe]), i:x.slug}));
    for(let g=1;g<=11;g++) IDX.push({type:'leg', label:ORD(g)+' circonscription législative', sub:LEG[g], key:norm(ORD(g)+' '+g+'e circonscription legislative '+LEG[g]), g});
    const q=document.getElementById('q'), qres=document.getElementById('qres'); let hits=[], act=0;
    function drawRes(){
      if(!hits.length){ qres.innerHTML='<div class="none">Aucun résultat</div>'; return; }
      qres.innerHTML=hits.map((h,i)=>`<button type="button" role="option" class="${i===act?'act':''}" data-i="${i}"><span class="k">${({leg:'Législative',dep:'Député',rcfde:'CFDE',rcafe:'AFE',rsen:'Sénat'})[h.type]||'Consulat'}</span><span class="t">${h.label}<small>${h.sub}</small></span></button>`).join('');
    }
    function goTo(h){
      qres.hidden=true; q.value=h.label; q.blur();
      if(h.type==='dep'){ showTab('dep'); SELDEP=h.g; setTimeout(()=>{ renderDep(); document.getElementById('deppanel').scrollIntoView({behavior:'smooth',block:'center'}); },30); return; }
      if(h.type==='rcfde'||h.type==='rcafe'||h.type==='rsen'){ const v={rcfde:'rep-cfde',rcafe:'cafe',rsen:'sen'}[h.type]; showTab(v); openFiche({rcfde:'cfde',rcafe:'cafe',rsen:'sen'}[h.type], h.i); return; }
      if(h.type==='cons'){
        showTab('cfde'); if(LEGF){ LEGF=0; legf.value=0; renderProj(); }
        const c=DATA[h.id]; select(h.id);
        if(!chart) renderMap(false); chart&&chart.setOption({geo:{center:[c.lon,c.lat], zoom:5}});
        document.getElementById('map').scrollIntoView({behavior:'smooth',block:'center'});
      } else {
        showTab('cfde'); LEGF=h.g; legf.value=h.g; renderMap(true); renderProj();
        document.getElementById('map').scrollIntoView({behavior:'smooth',block:'center'});
      }
    }
    q.addEventListener('input',()=>{
      const s=norm(q.value.trim()); if(!s){ qres.hidden=true; return; }
      const words=s.split(/\s+/);
      hits=IDX.filter(h=>words.every(w=>h.key.includes(w))).sort((a,b)=>(a.key.startsWith(s)?0:1)-(b.key.startsWith(s)?0:1)).slice(0,10);
      act=0; drawRes(); qres.hidden=false;
    });
    q.addEventListener('keydown',e=>{
      if(qres.hidden||!hits.length) return;
      if(e.key==='ArrowDown'){ act=(act+1)%hits.length; drawRes(); e.preventDefault(); }
      else if(e.key==='ArrowUp'){ act=(act-1+hits.length)%hits.length; drawRes(); e.preventDefault(); }
      else if(e.key==='Enter'){ goTo(hits[act]); e.preventDefault(); }
      else if(e.key==='Escape'){ qres.hidden=true; }
    });
    qres.addEventListener('mousedown',e=>{ const b=e.target.closest('button'); if(b){ e.preventDefault(); goTo(hits[+b.dataset.i]); } });
    q.addEventListener('blur',()=>setTimeout(()=>qres.hidden=true,120));
    q.addEventListener('focus',()=>{ if(q.value.trim()) q.dispatchEvent(new Event('input')); });

    // =====================================================================
    // ---------- Accueil ----------
    // =====================================================================
    let chartHome=null, HOME_SEL=null, HOME_HOVER=null, HOME_PEOPLE='dep', HOME_RAF=0;
    const ICE = ['#83b4e5','#eea4aa','#93c9b8','#e9bc76','#c3a4e4','#7fc9d4','#f4a77b','#d5ce79','#a8ce86','#94addf','#bf9bda'];
    const ICE_SEL = '#5f86ad', ICE_HOV = '#8eaccb';
    let HOME_MODE='2d', globe=null, HOME_INITIALIZED=false;
    const homeColor=g=>HOME_SEL===g ? ICE_SEL : HOME_HOVER===g ? ICE_HOV : ICE[g-1];
    const HOME_SMALL = () => window.matchMedia('(max-width:640px)').matches;
    function homeRegions(){
      // couleurs des circonscriptions ; le survol d'un pays est géré nativement par ECharts (aucun redessin complet)
      return legRegions(g=>({area: HOME_SEL===g ? ICE_SEL : HOME_HOVER===g ? ICE_HOV : ICE[g-1], op: HOME_SEL&&HOME_SEL!==g ? 0.55 : 1}))
        .map(r=>{ r.itemStyle.borderColor='rgba(255,255,255,.9)'; r.emphasis={itemStyle:{areaColor: r.itemStyle.areaColor===ICE_SEL ? ICE_SEL : ICE_HOV}}; return r; });
    }
    // mise à jour légère : seules les couleurs changent, regroupées à la prochaine image
    function updateHomeMap(){
      if(globe && HOME_MODE==='3d') globe.paint();
      document.querySelectorAll('#homeMapLegend button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.g===HOME_SEL)));
      if(!chartHome || HOME_RAF) return;
      HOME_RAF = requestAnimationFrame(()=>{ HOME_RAF=0; chartHome.setOption({geo:{regions:homeRegions()}}, false, true); });
    }
    function renderMapHome(){
      if(document.getElementById('v-home').hidden) return;
      if(HOME_MODE==='3d'){ if(globe) globe.draw(); return; }
      if(chartHome){ updateHomeMap(); return; }
      // résolution réelle de l'écran, une seule couche de dessin
      chartHome=echarts.init(document.getElementById('maphome'));
      chartHome.on('click',p=>{ const g=COUNTRY_LEG[p.name]; if(g) selectHome(HOME_SEL===g?null:g); });
      let rt=0; window.addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>chartHome&&chartHome.resize(),150); });
      chartHome.setOption({
        animation:false,
        tooltip:{trigger:'item', confine:true, transitionDuration:0, backgroundColor:'rgba(24,33,45,.88)', borderWidth:0, padding:[7,10], extraCssText:'border-radius:10px;box-shadow:0 8px 24px rgba(20,30,45,.2);', textStyle:{color:'#fff',fontSize:12,fontFamily:'Inter'},
          formatter:p=>{ const g=COUNTRY_LEG[p.name]; return g ? `<b>${p.name}</b><br>${ORD(g)} circonscription · ${LEG[g]}` : p.name; }},
        geo:{map:'world', roam: HOME_SMALL() ? false : true, center:[18,24], zoom:1.12, scaleLimit:{min:1,max:8}, itemStyle:{areaColor:'rgba(236,240,246,.92)', borderColor:'rgba(255,255,255,.95)', borderWidth:.5},
          emphasis:{label:{show:false}, itemStyle:{areaColor:'rgba(236,240,246,.92)'}}, label:{show:false}, regions: homeRegions()},
        series: legLayers({w:1}).map(x=>Object.assign({}, x, {zlevel:0}))
      }, true);
      homeAnimWatch();
    }
    // Projection orthographique : mêmes frontières et mêmes circonscriptions
    // que la carte plane, sans texture distante ni moteur WebGL.
    function makeHomeGlobe(){
      const d=window.d3, svg=d.select('#homeGlobeSvg');
      const world=echarts.getMap('world').geoJson, scale=world.UTF8Scale||1024;
      const ring=(r,o)=>{
        if(typeof r!=='string') return r.slice();
        let x=o[0],y=o[1],out=[];
        for(let i=0;i<r.length;i+=2){
          let a=r.charCodeAt(i)-64,b=r.charCodeAt(i+1)-64;
          x+=(a>>1)^(-(a&1)); y+=(b>>1)^(-(b&1)); out.push([x/scale,y/scale]);
        }
        return out;
      };
      const polygon=(rs,offsets)=>rs.map((r,i)=>{
        let coords=ring(r,offsets&&offsets[i]);
        if(coords.length&&coords[0].join(',')!==coords[coords.length-1].join(',')) coords.push(coords[0]);
        const large=d.geoArea({type:'Polygon',coordinates:[coords]})>2*Math.PI;
        if(large===(i===0)) coords=coords.slice().reverse();
        return coords;
      });
      const features=world.features.filter(f=>f.geometry&&['Polygon','MultiPolygon'].includes(f.geometry.type)).map(f=>{
        const g=f.geometry, coords=g.type==='Polygon'?polygon(g.coordinates,g.encodeOffsets):g.coordinates.map((p,i)=>polygon(p,g.encodeOffsets&&g.encodeOffsets[i]));
        return {type:'Feature',properties:f.properties,geometry:{type:g.type,coordinates:coords}};
      });
      const proj=d.geoOrthographic().translate([320,280]).scale(245).rotate([-18,-20]).clipAngle(90).precision(.65);
      const path=d.geoPath(proj), sphere={type:'Sphere'};
      let rotation=[-18,-20], zoom=1, drag=null, frame=0;
      svg.html('<defs><radialGradient id="hgOcean" cx="33%" cy="27%" r="77%"><stop offset="0%" stop-color="#315b88"/><stop offset="62%" stop-color="#132e51"/><stop offset="100%" stop-color="#06152d"/></radialGradient><radialGradient id="hgShade" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#a8d9ff" stop-opacity=".13"/><stop offset="67%" stop-color="#071a35" stop-opacity="0"/><stop offset="100%" stop-color="#010715" stop-opacity=".72"/></radialGradient><filter id="hgGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>');
      const halo=svg.append('circle').attr('cx',320).attr('cy',280).attr('fill','none').attr('stroke','#61b8ff').attr('stroke-width',13).attr('opacity',.6).attr('filter','url(#hgGlow)');
      const ocean=svg.append('path').attr('fill','url(#hgOcean)').attr('stroke','#85cbff').attr('stroke-width',1.8);
      const grid=svg.append('path').datum(d.geoGraticule10()).attr('class','hg-grid');
      const countries=svg.append('g').selectAll('path').data(features).join('path').attr('class','hg-country')
        .attr('data-g',f=>COUNTRY_LEG[f.properties.name]||0);
      countries.append('title').text(f=>{const g=COUNTRY_LEG[f.properties.name];return f.properties.name+(g?' · '+ORD(g)+' circonscription · '+LEG[g]:'');});
      const shade=svg.append('path').attr('fill','url(#hgShade)').attr('pointer-events','none');
      const markers=svg.append('g').selectAll('g').data(Object.entries(LEG_ANCHOR)).join('g').attr('class','hg-marker').attr('data-g',a=>a[0]);
      markers.append('circle').attr('r',10).attr('fill','#70c8ff').attr('opacity',.28);
      markers.append('circle').attr('r',4).attr('fill','#fff').attr('stroke','#66caff').attr('stroke-width',2);
      markers.append('text').attr('y',-13).attr('text-anchor','middle').text(a=>ORD(+a[0]));
      markers.append('title').text(a=>ORD(+a[0])+' circonscription · '+LEG[a[0]]);
      function paint(){
        countries.attr('fill',f=>{const g=COUNTRY_LEG[f.properties.name];return g?homeColor(g):'#4d657c';})
          .attr('fill-opacity',f=>{const g=COUNTRY_LEG[f.properties.name];return HOME_SEL&&g!==HOME_SEL?.48:.92;});
        markers.classed('selected',a=>+a[0]===HOME_SEL);
      }
      function draw(){
        proj.rotate(rotation).scale(245*zoom);
        halo.attr('r',245*zoom); ocean.attr('d',path(sphere)); grid.attr('d',path);
        countries.attr('d',path); shade.attr('d',path(sphere));
        const center=proj.invert([320,280]);
        markers.attr('display',a=>d.geoDistance(center,a[1])<Math.PI/2-.035?null:'none')
          .attr('transform',a=>{const p=proj(a[1]);return 'translate('+p[0]+','+p[1]+')';});
        paint();
      }
      function schedule(){if(!frame) frame=requestAnimationFrame(()=>{frame=0;draw();});}
      function turn(dx,dy){rotation=[rotation[0]+dx,Math.max(-85,Math.min(85,rotation[1]+dy))];schedule();}
      function changeZoom(delta){zoom=Math.max(.75,Math.min(2.5,zoom*delta));schedule();}
      const el=svg.node();
      el.addEventListener('pointerdown',e=>{
        if(e.button!==0)return;
        const target=e.target.closest('[data-g]');
        drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,g:target?+target.dataset.g:0};
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove',e=>{
        if(!drag)return;
        const k=80/(Math.max(180,el.clientWidth)*zoom);
        turn((e.clientX-drag.x)*k*3,-(e.clientY-drag.y)*k*3);
        drag.x=e.clientX;drag.y=e.clientY;
      });
      el.addEventListener('pointerup',e=>{
        if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6&&drag.g) selectHome(HOME_SEL===drag.g?null:drag.g);
        drag=null;
      });
      el.addEventListener('pointercancel',()=>{drag=null;});
      el.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?1.12:1/1.12);},{passive:false});
      el.addEventListener('keydown',e=>{
        const keys={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,12],ArrowDown:[0,-12]};
        if(keys[e.key]){e.preventDefault();turn(...keys[e.key]);}
        if(e.key==='+'||e.key==='-'){e.preventDefault();changeZoom(e.key==='+'?1.12:1/1.12);}
      });
      document.querySelectorAll('[data-globe]').forEach(b=>b.addEventListener('click',()=>{
        if(b.dataset.globe==='reset'){rotation=[-18,-20];zoom=1;schedule();}
        else changeZoom(b.dataset.globe==='in'?1.15:1/1.15);
      }));
      return {draw,paint};
    }
    function setHomeMode(mode){
      if(mode==='3d'&&!globe){
        if(!window.d3){document.getElementById('homeMapHint').textContent='Globe indisponible : la carte 2D reste accessible.';return;}
        try{globe=makeHomeGlobe();}catch(e){console.warn('Globe indisponible',e);document.getElementById('homeMapHint').textContent='Globe indisponible : la carte 2D reste accessible.';return;}
      }
      HOME_MODE=mode;
      document.querySelector('.home-map').classList.toggle('is-3d',mode==='3d');
      document.getElementById('homeGlobe').hidden=mode!=='3d';
      document.querySelector('.hm-lift').hidden=mode==='3d';
      document.querySelectorAll('.hm-switch button').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active));});
      document.getElementById('homeMapHint').textContent=mode==='3d'?'Faites glisser pour tourner · molette pour zoomer · cliquez sur un territoire':'Cliquez sur un territoire · faites glisser pour déplacer, molette pour zoomer';
      if(mode==='3d') globe.draw();
      else {renderMapHome();if(chartHome) chartHome.resize();}
    }
    document.querySelectorAll('.hm-switch button').forEach(b=>b.addEventListener('click',()=>setHomeMode(b.dataset.mode)));
    document.getElementById('homeMapLegend').innerHTML=Object.entries(LEG).map(([g,n])=>'<button type="button" data-g="'+g+'" aria-pressed="false" title="'+n+'" aria-label="'+ORD(+g)+' circonscription : '+n+'"><i style="background:'+ICE[g-1]+'"></i>'+ORD(+g)+'</button>').join('');
    document.getElementById('homeMapLegend').addEventListener('click',e=>{const b=e.target.closest('button');if(b)selectHome(HOME_SEL===+b.dataset.g?null:+b.dataset.g);});
    // lévitation suspendue hors écran, onglet masqué ou pendant l'utilisation de la carte
    function homeAnimWatch(){
      const hm=document.querySelector('.home-map'); if(!hm) return;
      const set=()=>hm.classList.toggle('is-paused', document.hidden || hm.dataset.off==='1');
      if('IntersectionObserver' in window) new IntersectionObserver(es=>{ es.forEach(e=>{ hm.dataset.off = e.isIntersecting?'0':'1'; set(); }); }).observe(hm);
      document.addEventListener('visibilitychange', set);
    }
    function homePerson(kind, x){
      if(kind==='dep') return `<button type="button" class="hp" data-k="dep" data-i="${x.g}" style="--d:${x.g}">
          ${photoHTML(x,'hp-photo')}<span class="hp-txt"><b>${esc(x.prenom)} ${esc(x.nom)}</b><span>${x.civ==='Mme'?'Députée':'Député'} · ${ORD(x.g)} circ.</span><span class="hp-g">${esc(x.groupe)}</span></span></button>`;
      return `<button type="button" class="hp" data-k="sen" data-i="${x.slug}" style="--d:${SEN.indexOf(x)}">
          ${senPhoto(x,'hp-photo')}<span class="hp-txt"><b>${esc(x.prenom)} ${esc(x.nom.toLowerCase().replace(/(^|[ -])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()))}</b><span>${x.civ==='Mme'?'Sénatrice':'Sénateur'} · ${x.serie===2?'élu(e) en 2026':'élu(e) en 2023'}, jusqu'en ${x.fin_mandat}</span><span class="hp-g">${esc(RSE.groupes[x.groupe])}</span></span></button>`;
    }
    function renderHomePeople(){
      document.querySelectorAll('#homePeopleTab button').forEach(b=>b.classList.toggle('on',b.dataset.v===HOME_PEOPLE));
      const el=document.getElementById('homePeople');
      const list = HOME_PEOPLE==='dep' ? (DEP?DEP.deputes.map(d=>homePerson('dep',d)):[]) : (RSE?SEN.map(s=>homePerson('sen',s)):[]);
      el.innerHTML = list.length ? list.join('') : '<div class="small" style="padding:10px">Données indisponibles.</div>';
      el.querySelectorAll('.hp[data-k="dep"]').forEach(b=>{ b.addEventListener('mouseenter',()=>{ HOME_HOVER=+b.dataset.i; updateHomeMap(); }); b.addEventListener('mouseleave',()=>{ HOME_HOVER=null; updateHomeMap(); }); });
    }
    function homeStat(v,l){ return `<div class="hs"><b>${v}</b><span>${l}</span></div>`; }
    function renderHomePanel(){
      const el=document.getElementById('homePanel'), g=HOME_SEL;
      if(!g){
        el.innerHTML = `<div class="hpn-eyebrow">Vue d'ensemble</div><h2 class="hpn-title">Le monde en 11 circonscriptions</h2>
          <p class="hpn-lead">Sélectionnez un territoire sur la carte pour découvrir son député, ses conseils consulaires et ses derniers résultats.</p>
          <div class="hstats">${homeStat('11','circonscriptions législatives')}${homeStat('130','circonscriptions consulaires')}${homeStat(fmt(CF.length||433),'conseillers des Français de l\'étranger')}${homeStat(String(AF.length||90),'conseillers à l\'AFE')}${homeStat(String(DEP?DEP.deputes.length:11),'députés')}${homeStat(String(SEN.length||12),'sénateurs')}</div>
          <button type="button" class="hbtn" data-go="leg24">Explorer les résultats <span aria-hidden="true">→</span></button>`;
        return;
      }
      const L=L24[g-1], el24=L.cands.find(c=>c.e), d=DEP&&DEP.deputes.find(x=>x.g===g);
      const cons=DATA.filter(c=>c.leg===g), ncf=CF.filter(r=>r.c.leg===g).length;
      const names=cons.map(c=>c.name).sort((a,b)=>a.localeCompare(b,'fr'));
      el.innerHTML = `<button type="button" class="hpn-close" data-close aria-label="Revenir à la vue d'ensemble">×</button>
        <div class="hpn-eyebrow">${ORD(g)} circonscription des Français de l'étranger</div>
        <h2 class="hpn-title">${LEG[g]}</h2>
        ${d?`<button type="button" class="hpn-dep" data-k="dep" data-i="${d.g}">${photoHTML(d,'hp-photo')}<span class="hp-txt"><span>${d.civ==='Mme'?'Députée':'Député'} en fonction</span><b>${esc(d.prenom)} ${esc(d.nom)}</b><span class="hp-g">${esc(d.groupe)}</span></span></button>`:''}
        <div class="hstats">${homeStat(String(cons.length),'circonscriptions consulaires')}${homeStat(fmt(ncf),'CFDE élus en 2026')}${homeStat(fmt(L.ins),'inscrits (législatives 2024)')}${homeStat(L.p1.toLocaleString('fr-FR')+' %','participation au 1er tour 2024')}</div>
        <div class="hpn-sec"><span>Élu(e) au 2nd tour 2024</span><b><span class="sw" style="background:${BLOCS[el24.b].c}"></span>${esc(el24.n)}</b> <span class="small">${esc(el24.lab)}</span></div>
        <div class="hpn-sec"><span>Circonscriptions consulaires</span><div class="hpn-tags">${names.slice(0,8).map(n=>`<span>${esc(n)}</span>`).join('')}${names.length>8?`<span class="more">+ ${names.length-8}</span>`:''}</div></div>
        <button type="button" class="hbtn" data-go="cfde" data-g="${g}">Explorer <span aria-hidden="true">→</span></button>
        <div class="hpn-links"><button type="button" data-go="leg24" data-g="${g}">Législatives 2024</button><button type="button" data-go="sim" data-g="${g}">Simulateur 2027</button>${d?`<button type="button" data-go="dep" data-g="${g}">Fiche du député</button>`:''}</div>`;
    }
    function selectHome(g){ HOME_SEL=g; updateHomeMap(); renderHomePanel(); }
    function homeGo(v, g){
      if(v==='cfde'&&g){ showTab('cfde'); LEGF=g; legf.value=g; renderMap(true); renderProj(); }
      else if(v==='leg24'){ showTab('leg24'); if(g&&SEL24!==g) selectLeg(g); }
      else if(v==='sim'){ if(g){ SIM.cur=g; saveSim(); } showTab('sim'); }
      else if(v==='dep'){ if(g) SELDEP=g; showTab('dep'); if(g) setTimeout(()=>{ try{ selectDep(g); }catch(e){} },30); }
      else showTab(v);
      window.scrollTo({top:0,behavior:'smooth'});
    }
    document.getElementById('v-home').addEventListener('click',e=>{
      const go=e.target.closest('[data-go]'); if(go){ homeGo(go.dataset.go, go.dataset.g?+go.dataset.g:null); return; }
      if(e.target.closest('[data-close]')){ selectHome(null); return; }
      const p=e.target.closest('[data-k]'); if(p) openFiche(p.dataset.k, p.dataset.i);
      const t=e.target.closest('#homePeopleTab button'); if(t){ HOME_PEOPLE=t.dataset.v; renderHomePeople(); }
    });
    renderHomePeople(); renderHomePanel();

    // =====================================================================
    // ---------- Bandeau de présentation contextuel ----------
    // =====================================================================
    function legKpis(L){
      if(!L) return [];
      const ins=L.reduce((a,d)=>a+d.ins,0), vot1=L.reduce((a,d)=>a+d.ins*d.p1/100,0), vot2=L.reduce((a,d)=>a+d.ins*d.p2/100,0);
      const nc=L.reduce((a,d)=>a+d.cands.length,0);
      return [["11","circonscriptions"],[fmt(ins),"inscrits au 1er tour"],[pct(vot1/ins),"participation au 1er tour"],[pct(vot2/ins),"participation au 2nd tour"],[fmt(nc),"candidats au 1er tour"]];
    }
    const VEILLE_HERO = v => window.VEILLE ? VEILLE.hero(v) : {t:'Veille parlementaire', p:'', k:[]};
    const HERO = {
      home:()=>({t:'Accueil', p:'', k:[]}),
      leg22:()=>({t:"Législatives 2022", p:"Résultats officiels des deux tours de juin 2022 dans les 11 circonscriptions des Français de l'étranger : carte, voix par candidat et comparaison avec 2024.",
        k: L22 ? legKpis(L22).slice(0,4).concat([[String(L22.filter(d=>d.partielle).length),"élections annulées puis rejouées"]]) : []}),
      leg24:()=>({t:"Législatives 2024", p:"Résultats officiels des législatives anticipées de juin-juillet 2024 : carte par tour, voix des candidats et comparaison avec le vote consulaire de 2026.", k:legKpis(L24)}),
      cfde:()=>({t:"Élections des conseillers des Français de l'étranger 2026", p:"Résultats des élections des conseillers des Français de l'étranger de mai 2026, couleur politique des listes et rapports de force par circonscription législative.", k:KPI_CFDE}),
      sim:()=>({t:"Simulateur législatif 2027", p:"Simulation des 11 sièges à partir du 1er tour 2024 : modifiez scores, participation, désistements et reports. Les résultats sont des hypothèses, pas des prévisions.",
        k:[["11","sièges à pourvoir"],["2024","1er tour, point de départ"],["12,5 %","des inscrits pour le 2nd tour"],["50 % + 25 %","exprimés et inscrits : élu au 1er tour"]]}),
      'rep-cfde':()=>({t:"Conseillers des Français de l'étranger", p:"Élus pour six ans au suffrage universel direct dans 130 circonscriptions consulaires, ils siègent aux conseils consulaires, élisent les conseillers à l'AFE et votent aux sénatoriales.",
        k: RCF ? [[fmt(CF.length),"conseillers élus en 2026"],["130","circonscriptions consulaires"],[String(CF.filter(r=>r.pres).length),"présidents de conseil identifiés"],[String(CF.filter(r=>r.afe).length),"également conseillers à l'AFE"]] : []}),
      cafe:()=>({t:"Conseillers à l'Assemblée des Français de l'étranger", p:"Élus par et parmi les conseillers des Français de l'étranger, ils siègent à l'AFE, qui conseille le Gouvernement sur la situation des Français établis hors de France.",
        k: RAF ? [[String(AF.length),"conseillers à l'AFE"],[String(RAF.circonscriptions.length),"circonscriptions AFE"],[String(Object.keys(RAF.commissions).length),"commissions"],[String(Object.keys(RAF.groupes).length-(RAF.groupes.NI?1:0)),"groupes"]] : []}),
      dep:()=>({t:"Députés des Français de l'étranger", p:"Onze députés élus au scrutin uninominal majoritaire à deux tours, un par circonscription législative, représentent les Français établis hors de France à l'Assemblée nationale.",
        k: DEP ? [[String(DEP.deputes.length),"députés en fonction"],[String(new Set(DEP.deputes.map(d=>d.groupe)).size),"groupes parlementaires"],[String(DEP.deputes.filter(d=>/^Suppléant/.test(d.mode)).length),"suppléants devenus députés"],(n=>[String(n),n>1?"députés élus en législative partielle":"député élu en législative partielle"])(DEP.deputes.filter(d=>d.partielle).length),[fmtDate(DEP.maj).replace(/ \d{4}$/,''),"dernière vérification"]] : []}),
      veille:()=>VEILLE_HERO('veille'), 'veille-comptes':()=>VEILLE_HERO('veille-comptes'),
      legislatif:()=>({t:'Activité législative',p:"Suivez les propositions de loi portées par les parlementaires des Français de l’étranger, leur parcours législatif et les prochaines échéances connues.",k:[]}),
      sen:()=>({t:"Sénateurs des Français de l'étranger", p:"Douze sénateurs élus pour six ans au scrutin indirect par les élus des Français de l'étranger ; le Sénat est renouvelé par moitié tous les trois ans.",
        k: RSE ? [[String(SEN.length),"sénateurs"],[String(SEN.filter(x=>x.serie===2).length),"élus ou réélus en septembre 2026"],[String(new Set(SEN.map(x=>x.groupe)).size),"groupes politiques"],[String(SEN.filter(x=>x.civ==='Mme').length),"sénatrices"]] : []})
    };
    function updateHero(v){
      const rt=ROUTE[v]; const f=HERO[v];
      document.getElementById('heroRub').textContent = rt ? NAV[rt.r].label : '';
      if(!f||rt.soon){ document.getElementById('heroTitle').textContent = rt?rt.l:''; document.getElementById('heroSub').textContent='Contenu à venir.'; document.getElementById('kpis').innerHTML=''; return; }
      const h=f();
      document.getElementById('heroTitle').textContent=h.t;
      document.getElementById('heroSub').textContent=h.p;
      const k=document.getElementById('kpis');
      k.innerHTML = h.k.map(x=>`<div class="kpi"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
      k.hidden = !h.k.length;
    }
    if(window.VEILLE) VEILLE.init({DEP, SEN, RSE, LEG, ORD, photoHTML, senPhoto, grpColor, SGRP_COL, openFiche, closeFiche, showTab,
      refreshHero:()=>{ if(ROUTE[CUR_ROUTE] && ROUTE[CUR_ROUTE].r==='veille') updateHero(CUR_ROUTE); }});
    const veilleLink = h => { const m=/^veille\/(.+)$/.exec(h); if(!m||!window.VEILLE) return false; const id=decodeURIComponent(m[1]);
      if(CUR_ROUTE!=='veille-comptes'&&!/^veille/.test(CUR_ROUTE)) showTab('veille-comptes');
      (async()=>{ for(let i=0;i<50&&!VEILLE.has(id);i++) await new Promise(r=>setTimeout(r,100)); if(VEILLE.has(id)) openFiche('veille', id); })(); return true; };
    window.addEventListener('hashchange',()=>{ const h=location.hash.slice(1); if(veilleLink(h)) return; if((ROUTE[h]||h==='scen')&&h!==CUR_ROUTE){ if(!modal.hidden) closeFiche(); showTab(h); } });
    { const h=location.hash.slice(1); if(veilleLink(h)) {} else if(ROUTE[h]||h==='scen') showTab(h); else { showTab('home'); } }
  } catch (erreur) {
    console.error('Erreur lors du chargement de l’observatoire :', erreur);
    const message = document.createElement('div');
    message.style.cssText = 'max-width:900px;margin:24px auto;padding:20px;border:1px solid #d2d0ca;border-radius:10px;background:#fff;line-height:1.6';
    const titre = document.createElement('strong');
    titre.textContent = 'Impossible de charger les données électorales';
    const description = document.createElement('p');
    description.textContent = 'Ouvrez cette application depuis un serveur local, et non par un double-clic sur index.html. Sur Mac : ouvrez le Terminal dans ce dossier, exécutez « python3 -m http.server 8000 », puis rendez-vous sur http://localhost:8000.';
    message.append(titre, description);
    document.querySelector('main')?.prepend(message);
  }
}
demarrerObservatoire();
