#!/usr/bin/env python3
"""Rebuild the standalone tracker from official open data. Standard library only."""
import argparse, csv, datetime as dt, html, io, json, re, unicodedata, zipfile
from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor

AN = 'https://data.assemblee-nationale.fr/static/openData/repository/17/'
SOURCES = {
    'an.zip': AN+'loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip',
    'deputes.csv': AN+'amo/deputes_actifs_csv_opendata/liste_deputes_libre_office.csv',
    'ppl.csv': 'https://data.senat.fr/data/dosleg/ppl.csv',
    'senateurs.html': 'https://www.senat.fr/senateurs/senateurs_representant_les_francais_etablis_hors_de_france.html',
}
START = '2024-07-08'
TODAY = dt.date.today().isoformat()
ROOT = Path(__file__).resolve().parent.parent
def norm(s):
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c) != 'Mn')).split())
def subject(title):
    t=norm(title)
    return any(re.search(p,t) for p in [r'francais(?:es)? (?:etablis|residant|vivant) (?:a l etranger|hors de france)',r'francais(?:es)? expatries',r'francais(?:es)? de l etranger',r'francais(?:es)? hors de france',r'conseil(?:s)? consulaire',r'election.{0,30}consulaire',r'enseignement francais a l etranger',r'caisse des francais',r'non residents',r'assemblee des francais'])
def download(name, cache):
    if cache: return (cache/name).read_bytes()
    with urlopen(Request(SOURCES[name],headers={'User-Agent':'ObservatoireFDE/1.0 (open data)'}),timeout=120) as r: return r.read()
def rows(data, encoding='utf-8-sig', delimiter=','):
    return list(csv.DictReader(io.StringIO(data.decode(encoding)),delimiter=delimiter))
def many(v): return v if isinstance(v,list) else [v] if isinstance(v,dict) else []
def walk(x):
    if isinstance(x,dict):
        if x.get('dateActe'): yield x
        for v in x.values(): yield from walk(v)
    elif isinstance(x,list):
        for v in x: yield from walk(v)
def datestr(s):
    return dt.datetime.strptime(s,'%d/%m/%Y').date().isoformat() if s else None
def senate_names(raw):
    matches=re.findall(r'<a\s+href="/senateur/[^"<>]+\.html"[^>]*>([^<]+)</a>',raw.decode('utf-8'),re.I)
    result=[]
    for m in matches:
        parts=m.split('&nbsp;')
        if len(parts)==2:
            last,first=map(lambda p:' '.join(html.unescape(p).split()),parts)
            result.append(first+' '+last)
    if len(result)!=12: raise ValueError(f'Liste Sénat inattendue : {len(result)} noms')
    return result
def events(d):
    out=[]
    for a in walk(d.get('actesLegislatifs')):
        code=a['codeActe']; typ=a.get('@xsi:type',''); date=a['dateActe'][:10]
        label=a.get('libelleActe',{}).get('nomCanonique',typ)
        conclusion=(a.get('statutConclusion') or {}).get('libelle','')
        if conclusion: label+=' : '+conclusion
        if code.startswith('AN'): label='Assemblée · '+label
        elif code.startswith('SN'): label='Sénat · '+label
        out.append({'date':date,'label':label,'code':code,'type':typ,'conclusion':conclusion})
    return sorted(out,key=lambda e:e['date'])
def an_state(ev):
    types={e['type'] for e in ev}
    if 'Promulgation_Type' in types:return 'Promulguée',6,True
    if 'RetraitInitiative_Type' in types:return 'Retirée',0,True
    decisions=[e for e in ev if e['type']=='Decision_Type' and e['conclusion']]
    if decisions and norm(decisions[-1]['conclusion']) in ('rejete','non adopte'):return 'Rejet enregistré',3,False
    if 'DepotInitiativeNavette_Type' in types or 'RenvoiCMP_Type' in types:return 'En navette',4,False
    if decisions and 'adopte' in norm(decisions[-1]['conclusion']):return 'Adoption enregistrée',3,False
    if 'DiscussionSeancePublique_Type' in types:return 'En séance publique',3,False
    if types & {'DiscussionCommission_Type','DepotRapport_Type','NominRapporteurs_Type'}:return 'Travaux en commission',2,False
    if 'SaisieComFond_Type' in types:return 'Renvoyée en commission',1,False
    return 'Déposée',0,False
def sn_state(status):
    k=norm(status)
    if k=='promulgue':return 'Promulguée',6,True
    if k in ('non adopte','caduc','retire','non conforme a la constitution'):return status.capitalize(),0,True
    if 'premiere lecture' in k:return status,4 if '(an)' in status.lower() else 1,False
    return status or 'État non publié',4 if any(x in k for x in ['lecture','commission mixte']) else 0,False
def supplement_senate(record):
    # The official DOSLEG CSV provides the state, not every dated event.
    # Only add explicitly dated decisions found on the corresponding official page.
    try:
        with urlopen(Request(record['url'],headers={'User-Agent':'ObservatoireFDE/1.0 (open data)'}),timeout=25) as r: raw=r.read().decode('utf-8')
        months={m:i+1 for i,m in enumerate('janvier février mars avril mai juin juillet août septembre octobre novembre décembre'.split())}
        for match in re.findall(r'<li\b[^>]*>(.*?)</li>',raw,flags=re.I|re.S):
            t=' '.join(html.unescape(re.sub(r'<[^>]+>',' ',match)).split())
            m=re.fullmatch(r'(Texte (?:rejeté|adopté|adopté définitivement) (?:par (?:le Sénat|l.Assemblée nationale) )?le) (\d{1,2})(?:er)? ([a-zéûôîà]+) (\d{4})\.?',t,re.I)
            if not m or m[3].lower() not in months:continue
            date=dt.date(int(m[4]),months[m[3].lower()],int(m[2])).isoformat()
            if date<=TODAY and not any(e['date']==date and e.get('type')=='Decision_Type' for e in record['events']):record['events'].append({'date':date,'label':m[1].removesuffix(' le')})
        record['events'].sort(key=lambda e:e['date']);record['when']=record['events'][-1]['date']
    except Exception as e:print('Complément Sénat indisponible :',record['id'],type(e).__name__)
    return record
def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,help='Optional offline source files');p.add_argument('--page',type=Path,default=ROOT/'suivi-legislatif-fde.html');args=p.parse_args()
    with ThreadPoolExecutor(max_workers=4) as pool:
        data=dict(zip(SOURCES,pool.map(lambda n:download(n,args.cache),SOURCES)))
    deputies=rows(data['deputes.csv']); by_id={'PA'+r['identifiant']:r['Prénom']+' '+r['Nom'] for r in deputies}; fde={k for k,r in zip(by_id,deputies) if 'hors de France' in r['Département']}; assert len(fde)==11
    senators=senate_names(data['senateurs.html']); sn_names={norm(n) for n in senators}
    result=[]; sn_events={}
    z=zipfile.ZipFile(io.BytesIO(data['an.zip']))
    for name in z.namelist():
        if '/dossierParlementaire/' not in name:continue
        d=json.loads(z.read(name))['dossierParlementaire']; proc=(d.get('procedureParlementaire') or {}).get('libelle','')
        if proc!='Proposition de loi ordinaire': continue
        ev=events(d); deposits=[e for e in ev if e['type']=='DepotInitiative_Type'];
        if not deposits:continue
        dep=deposits[0]; title=d['titreDossier']['titre']; senat=d['titreDossier'].get('senatChemin');
        if senat: sn_events[senat.replace('http:','https:')]=ev
        if not dep['code'].startswith('AN') or dep['date']<START:continue
        initiator=d.get('initiateur') or {}; refs=[a.get('acteurRef') for a in many((initiator.get('acteurs') or {}).get('acteur'))]; main=refs[0] if refs else None
        authors=main in fde; subj=subject(title)
        if not(authors or subj):continue
        past=[e for e in ev if e['date']<=TODAY]; future=[e for e in ev if e['date']>TODAY];status,step,closed=an_state(past)
        result.append(dict(id=d['uid'],title=title,author=by_id.get(main,'Auteur à vérifier sur le dossier officiel'),chamber='Assemblée nationale',theme='Non classé',authors=authors,subject=subj,deposit=dep['date'],when=past[-1]['date'] if past else dep['date'],status=status,step=step,closed=closed,events=past,future=future,url='https://www.assemblee-nationale.fr/dyn/17/dossiers/'+d['titreDossier']['titreChemin'],cosignataires=[],source='Assemblée nationale – dossiers législatifs'))
    for row in rows(data['ppl.csv'],'cp1252',';'):
        if row['Type de dossier']!='proposition de loi':continue
        date=datestr(row['Date de dépôt']);
        if not date or date<START:continue
        names=[n.strip() for n in row['Auteurs'].split(',') if n.strip()]; author=names[0] if names else 'Auteur non indiqué'; authors=norm(author) in sn_names; subj=subject(row['Titre']);
        if not(authors or subj):continue
        url=row['URL du dossier'].replace('http:','https:'); status,step,closed=sn_state(row['État du dossier']); ev=sn_events.get(url,[]); past=[e for e in ev if e['date']<=TODAY]; future=[e for e in ev if e['date']>TODAY]
        if not past:past=[{'date':date,'label':'Dépôt au Sénat'}]
        prom=datestr(row['Date de promulgation']);
        if prom and not any(e.get('type')=='Promulgation_Type' for e in past):past.append({'date':prom,'label':'Promulgation · loi n° '+row['Numéro de la loi']})
        result.append(dict(id='SN-'+row['Session']+'-'+row['Numéro de texte'],title=row['Titre'],author=author,chamber='Sénat',theme=row['Thèmes'] or 'Non classé',authors=authors,subject=subj,deposit=date,when=max(e['date'] for e in past),status=status,step=step,closed=closed,events=past,future=future,url=url,cosignataires=names[1:],source='Sénat – DOSLEG',limitations='État issu du fichier officiel DOSLEG. Les dates non publiées dans ce fichier ne sont pas déduites.'))
    if not result or not any(r['chamber']=='Sénat' for r in result) or not any(r['chamber']=='Assemblée nationale' for r in result):raise RuntimeError('Corpus incomplet, mise à jour annulée')
    # Only dossiers whose terminal status is known but whose dates are incomplete require enrichment.
    if not args.cache:
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(supplement_senate,[r for r in result if r['chamber']=='Sénat' and r['closed'] and r['status']!='Promulguée']))
    # Prevent HTML/script injection and preserve the page if validation fails.
    payload=json.dumps({'updated':TODAY,'start':START,'dossiers':result,'senators':senators,'deputies':[by_id[k] for k in sorted(fde)]},ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    page=args.page.read_text(encoding='utf-8'); pattern=r'/\*DATA_BEGIN\*/.*?/\*DATA_END\*/'
    new,n=re.subn(pattern,lambda m:'/*DATA_BEGIN*/'+payload+'/*DATA_END*/',page,flags=re.S)
    if n!=1:raise RuntimeError('Marqueur de données introuvable ou dupliqué')
    temp=args.page.with_suffix('.tmp');temp.write_text(new,encoding='utf-8');temp.replace(args.page)
    snapshot=args.page.parent/'legislatif-data.json';temp=snapshot.with_suffix('.tmp');temp.write_text(payload+'\n',encoding='utf-8');temp.replace(snapshot)
    print(f'{len(result)} dossiers · {sum(r["authors"] for r in result)} premiers auteurs FDE · {sum(r["subject"] for r in result)} titres FDE')
if __name__=='__main__':main()
