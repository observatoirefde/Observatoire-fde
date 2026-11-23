# Observatoire FDE : consignes pour Claude

Site public de veille électorale et parlementaire sur les Français établis hors de France.
En ligne : https://observatoirefde.github.io/Observatoire-fde/ (GitHub Pages, branche `main`, racine du dépôt).

## Règles impératives

- **Ne rien inventer** : ni chiffre, ni élu, ni affiliation politique, ni compte de réseau social, ni publication, ni photo. Une information non vérifiable reste vide et est signalée « à vérifier ».
- **Exactitude juridique et institutionnelle** : ton institutionnel, pédagogique et concis. Citer les sources (Constitution, code électoral, loi n° 2013-659 modifiée, MEAE, Assemblée nationale, Sénat, AFE).
- **Ne pas casser l'existant** : modifier uniquement ce qui est demandé, conserver données, cartes, tableaux et fonctionnalités des autres rubriques.
- **Coût nul** : aucun service payant, aucune clé dans le code public, aucune aspiration de pages (scraping). API officielles uniquement.
- **Charte graphique** : thème « verre dépoli » (`.glass`), polices Manrope (titres) et Inter (texte), couleurs de blocs politiques en variables CSS (`--LFI`, `--GAU`, `--ECO`, `--ENS`, `--ASFE`, `--LR`, `--ED`, `--IND`), points de rupture 1180 px et 640 px, `prefers-reduced-motion` respecté.
- **Langue** : interface, commentaires et messages en français.

## Mise à jour du site par l'éditeur (important)

L'éditeur n'utilise pas Git en ligne de commande. **Depuis le 22/11/2026, il souhaite seulement accepter les changements, sans rien déposer ni glisser lui-même** : livrer par **demande de fusion (pull request)**, et non plus par archive .zip.

Pour livrer une modification :
1. Partir de la version en ligne (`git fetch origin main`, puis créer ou recréer la branche de travail sur `FETCH_HEAD`), jamais d'une copie ancienne.
2. Modifier le **moins de fichiers possible** ; préférer un fichier de données (JSON) au code quand un contenu doit rester éditable.
3. Lancer les tests et vérifier dans un navigateur (Playwright, sur ordinateur et mobile).
4. Valider (commit) sur la branche de travail `claude/…` de la session, la pousser, puis **ouvrir une demande de fusion vers `main`** avec un résumé clair en français : ce qui change, pourquoi, fichiers modifiés et vérifications faites. Ne jamais pousser directement sur `main` ni fusionner soi-même : l'éditeur relit et clique sur « Merge pull request ».
5. Donner le lien de la demande de fusion à l'éditeur ; après fusion, revérifier le dépôt en ligne (`git fetch`, comparaison des fichiers, validation YAML des workflows).

Ne jamais inclure dans une demande de fusion les fichiers réécrits par les workflows (`data/veille/bluesky/`, `data/veille/instagram/`).

Ne pas modifier `index.html` à la main sans nécessité : il pèse 1,5 Mo (données intégrées). Préférer une insertion dynamique depuis `app.js`.

## Architecture

Site statique sans compilation : HTML, CSS et JavaScript, bibliothèques par CDN (ECharts 4.9, D3 7).

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des vues (`<div id="v-…" class="view">`) |
| `app.js` | Application principale : navigation, cartes, tableaux, annuaires, simulateur, fiches, hémicycle AFE |
| `style.css` | Présentation (sections commentées, ajouts en fin de fichier) |
| `veille-bluesky.js` | Lecture des publications Bluesky, partagée entre le site et le collecteur |
| `veille.js` | Rubrique « Veille » (anciennement « Activité des parlementaires des Français de l'étranger ») : sous-rubrique « Réseaux sociaux » (fil, filtres, fiches) |
| `institutionnel.js`, `collecteur/institutionnel.mjs`, `data/institutionnel/` | Sous-rubrique « Veille institutionnelle » (Veille, route `#institutionnel`) : chargée à la demande par `app.js`, qui crée la vue `v-institutionnel` (voir section dédiée) |
| `suivi-legislatif-fde.html`, `legislatif-data.json`, `scripts/refresh_legislatif.py` | Sous-rubrique « Activité législative » (voir `LISEZMOI-suivi-legislatif.md`) |
| `collecteur/bluesky-liste.mjs`, `collecteur/instagram.mjs` | Collecteurs automatiques (Node 20, sans dépendance) |
| `contentieux.js`, `collecteur/contentieux.mjs`, `data/contentieux/` | Sous-rubrique « Contentieux électoral » (Élections, route `#contentieux`) : `contentieux.js` est chargé à la demande par `app.js`, qui crée la vue `v-contentieux` ; `contentieux.html` ne fait plus que rediriger vers `./#contentieux` |
| `tests/*.test.mjs` | Tests : `node tests/veille.test.mjs && node tests/collecteur.test.mjs && node tests/instagram.test.mjs && node tests/contentieux.test.mjs && node tests/institutionnel.test.mjs` |
| `netlify.toml`, `README.txt`, `Dossier` | Héritages d'un ancien déploiement Netlify ; `Dossier` est un fichier JavaScript isolé, non chargé par le site |

Navigation (`app.js`, objet `NAV`) : un onglet principal par rubrique, des sous-onglets par section ; route = `#clé` (`home`, `leg22`, `leg24`, `cfde`, `sim`, `contentieux`, `rep-cfde`, `cafe`, `dep`, `sen`, `veille`, `legislatif`, `institutionnel`). `showTab(v)` affiche la vue et appelle son rendu ; `HERO` définit le bandeau d'en-tête ; `openFiche(type, id)` ouvre la fenêtre de fiche.

Rubrique « Élections » : textes de présentation des scrutins dans `data/elections-presentations.json` (modifiables sans code).

## Données (`data/`)

- `consulaires-2026.json` : résultats CFDE 2026 (130 circonscriptions, listes, voix, sièges ; bloc politique `b` attribué par l'Observatoire, avec indice de confiance).
- `cfde-2026.json` : 433 CFDE élus, liste d'élection, présidence, lien AFE (`afe`).
- `cafe-2026.json` : 90 conseillers à l'AFE, groupes, commissions (annuaire officiel de l'AFE ; pas de photos).
- `deputes-2026.json`, `senateurs-2026.json` : 11 députés et 12 sénateurs ; portraits dans `assets/deputes/` et `assets/senateurs/`.
- `legislatives-2022.json`, `legislatives-2024.json` : résultats officiels.
- Ordre gauche-droite des blocs : `LFI, GAU, ECO, ENS, ASFE, LR, ED, IND` (constante `ORDER` dans `app.js`). Les groupes de l'AFE n'ont pas d'étiquette partisane officielle : leur ordre est déduit des listes CFDE de leurs membres et présenté comme indicatif.

## Veille des réseaux sociaux

- Registre des comptes : `data/veille/comptes.json`, clé = identifiant AN (`PA…`) ou Sénat. Champs `verification` (`verifie` / `a_verifier`), `collecte`, `source`. Réglages : `data/veille/config.json`.
- **Bluesky** : la liste de référence de l'éditeur (`config.json → bluesky.liste`) est la source. Workflow `.github/workflows/veille-bluesky.yml` toutes les 30 minutes ; `getList`, `getListFeed` puis `getAuthorFeed` par membre ; historique mensuel dans `data/veille/bluesky/`.
- **Instagram** : API officielle Business Discovery de Meta (comptes professionnels uniquement). Workflow `.github/workflows/veille-instagram.yml`, **deux passages par jour seulement (8 h et 19 h, heure de Paris)** : un rythme horaire a déclenché un blocage de sécurité de Meta. Secret GitHub `IG_TOKEN` (jeton de page, sans expiration) ; `instagram.ig_user_id` dans `config.json`. Historique dans `data/veille/instagram/` ; récapitulatif en commentaire de l'issue « Veille Instagram : récapitulatifs ». Comptes personnels non lisibles (`nathcog`, `fredericpetitan`, `sbg_senat` au 22/11/2026).
- **LinkedIn** : aucune API ; sélection manuelle dans `data/veille/selection.json`. **X** : API payante, non activée (liens seulement). **Facebook** : liens seulement.
- Les fichiers `data/veille/bluesky/` et `data/veille/instagram/` sont réécrits par les workflows : ne jamais les livrer dans une archive.

## Contentieux électoral (CFDE et AFE 2026)

- Le Conseil d'État juge ces élections (une protestation déposée au tribunal administratif de Paris lui est transmise : CE, 4 novembre 2026, n° 516536).
- Source : archives open data `https://opendata.justice-administrative.fr/DCE/AAAA/MM/CE_AAAAMM.zip` (environ 2 Mo par mois). Des décisions sont ajoutées après coup aux archives anciennes : relire toutes les archives depuis mai 2026.
- Workflow `.github/workflows/veille-contentieux.yml`, **un passage par jour** : tests, collecte, réécriture de `data/contentieux/detections.json` seulement si une donnée change (au moins une fois par semaine), alerte en commentaire de l'issue « Veille contentieux : décisions à examiner ».
- Affichage : sous-rubrique « Contentieux électoral » de la rubrique « Élections » ; présentation dans `data/elections-presentations.json` (clé `contentieux`) ; indicateurs du bandeau calculés sur `recours.json` uniquement.
- Fichiers éditoriaux (modifiés par demande de fusion, après vérification sur le texte officiel) : `data/contentieux/recours.json` (seuls recours comptés et affichés comme confirmés) et `data/contentieux/ecartees.json` (décisions hors sujet). `detections.json` est réécrit par le workflow : ne pas le modifier.
- Détection testée sur les archives 2021-2022 (élections consulaires de 2021) : 17 décisions retrouvées, aucun faux positif.
- En local, le `fetch` de Node passe par le proxy du conteneur seulement avec `NODE_USE_ENV_PROXY=1` ; `node collecteur/contentieux.mjs --archives dossier` lit des archives déjà téléchargées.

## Veille institutionnelle

- Étape 1 en place : **Journal officiel** et **bibliothèque documentaire**, avec recherche commune. Étapes suivantes prévues : agenda institutionnel (open data de l'agenda de l'Assemblée, export ICS), travaux de l'AFE (rapprochement résolutions et réponses, lecture des PDF avec `pdftotext`, accord de l'éditeur du 23/11/2026).
- Workflow `.github/workflows/veille-institutionnelle.yml`, **un passage par jour** (5 h 53 UTC) ; chaque module est isolé (une source en panne garde ses données précédentes, l'erreur est notée dans `data/institutionnel/etat.json`) ; nouveautés et erreurs en commentaire de l'issue « Veille institutionnelle : nouveautés ».
- **JO** : fichiers quotidiens de la DILA (`echanges.dila.gouv.fr/OPENDATA/JORF/`), lus après `dernier_fichier`. Le répertoire ne garde que les fichiers postérieurs au dernier export complet : la reprise depuis le 1er septembre 2026 a lu une fois `Freemium_jorf_global_….tar.gz` (1,6 Go, lu en flux). Les fichiers du jour contiennent aussi d'anciens textes republiés : filtre sur `DATE_PUBLI`. Pertinence « forte » : titre visant les Français de l'étranger ou NOR `EAEF` (direction des Français à l'étranger) ; « moyenne » : autre texte du MEAE hors mesures individuelles, accords internationaux utiles. Les réglages (`data/institutionnel/config.json`) se réappliquent à chaque passage aux textes déjà collectés.
- **Bibliothèque** : rapports du Sénat (flux RSS, encodage ISO-8859-15 ; propositions de loi exclues, déjà dans « Activité législative »), documents PDF de l'AFE via l'API publique WordPress (`/wp-json/wp/v2/media`, délai de 10 s demandé par le site ; ne pas lire les pages HTML), entrées manuelles vérifiées dans `bibliotheque-editoriale.json`. Pour l'AFE, la date est celle de la mise en ligne (dossier `uploads/AAAA/MM`).
- Fichiers réécrits par le workflow (`jo.json`, `bibliotheque.json`, `etat.json`) : ne pas les modifier à la main.

## Pièges connus

- Les workflows YAML doivent être valides : un collage partiel (premier `#` perdu, ancien contenu restant) les désactive silencieusement (la tâche s'affiche alors sous son chemin de fichier dans l'onglet Actions).
- Les tests Instagram sont lancés avant chaque collecte : `collecteur/instagram.mjs` et `tests/instagram.test.mjs` doivent être livrés ensemble quand l'un change.
- « Activité législative » : workflow `.github/workflows/actualiser-legislatif.yml` (« Actualiser le suivi législatif FDE », chaque jour à 5 h 17 UTC), rétabli le 23/11/2026. `scripts/refresh_legislatif.py` n'utilise que des données ouvertes et `data/senateurs-2026.json` ; la lecture des pages des dossiers du Sénat (`--complement-senat`) est désactivée par défaut, les dates de vote déjà relevées sont conservées.
