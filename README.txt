OBSERVATOIRE ÉLECTORAL — MODE D’EMPLOI (MAC)

1. Décompressez le fichier ZIP.
2. Placez le dossier « Observatoire-electoral » sur votre Bureau.
3. Ouvrez le Terminal sur Mac (via Spotlight : Cmd + Espace, tapez Terminal).
4. Copiez-collez cette commande, puis appuyez sur Entrée :

   cd ~/Desktop/Observatoire-electoral && python3 -m http.server 8000

5. Dans Safari ou Chrome, allez sur : http://localhost:8000

Gardez la fenêtre du Terminal ouverte pendant l’utilisation.
Pour arrêter : dans le Terminal, appuyez sur Ctrl + C.

Si le dossier se trouve ailleurs, ouvrez le Terminal, tapez « cd » suivi d’un espace, glissez le dossier Observatoire-electoral dans la fenêtre et appuyez sur Entrée. Puis tapez : python3 -m http.server 8000

PUBLICATION SUR NETLIFY
Glissez-déposez le dossier « Observatoire-electoral » sur https://app.netlify.com/drop, ou reliez-le à un dépôt Git (le fichier netlify.toml publie la racine du dossier, sans étape de compilation).

INTERFACE
Trois rubriques. « Élections » : Législatives 2022 (résultats officiels et comparaison 2022–2024), Législatives 2024, Consulaires 2026 (avec les scénarios 2027 issus des voix CFDE), Simulateur 2027. « Les représentants des Français de l'étranger » : annuaires des CFDE, des conseillers à l'AFE, des députés et des sénateurs, avec recherche, filtres et fiches individuelles ; recherche rapide par nom, pays, ville ou circonscription dans la barre de navigation, thème « verre dépoli ». « Veille parlementaire » : fil d'actualité des publications publiques des 23 parlementaires, annuaire de leurs comptes et état de la couverture des sources.

FICHIERS
index.html : structure des pages
style.css : présentation graphique
app.js : fonctionnement des cartes et des tableaux
data/consulaires-2026.json : résultats consulaires
data/legislatives-2022.json : résultats législatifs 2022 (ministère de l'Intérieur)
data/legislatives-2024.json : résultats législatifs 2024
netlify.toml : configuration de publication Netlify
veille.js : rubrique Veille parlementaire (fil, filtres, fiches, connecteurs)
veille-bluesky.js : lecture des publications Bluesky, partagée entre le site et le collecteur
collecteur/bluesky-liste.mjs : collecte automatique Bluesky (lancée par GitHub Actions)
.github/workflows/veille-bluesky.yml : programmation de la collecte toutes les 30 minutes
data/veille/config.json : lien de la liste Bluesky de référence et adresse de l'historique
data/veille/bluesky/ : historique collecté (etat.json + un fichier par mois)
data/veille/comptes.json : comptes sociaux des 23 parlementaires (vérifiés le 20/11/2026)
data/veille/themes.json : règles du classement thématique par mots-clés
data/veille/selection.json : publications LinkedIn et Instagram choisies (sélection manuelle)
tests/ : tests automatiques (node tests/veille.test.mjs et node tests/collecteur.test.mjs) ; non publié
data/deputes-2026.json : députés en fonction (fiches officielles de l'Assemblée nationale, vérifiées le 18/11/2026)
data/cfde-2026.json : 433 CFDE élus en 2026 (tableau officiel des élus, MEAE), liste d'élection, présidences connues, lien AFE
data/cafe-2026.json : 90 conseillers à l'AFE (annuaire officiel de l'AFE, consulté le 18/11/2026)
data/senateurs-2026.json : 12 sénateurs des Français établis hors de France (senat.fr, mis à jour le 18/11/2026)
assets/depute-neutre.svg : silhouette affichée en l'absence de photo
assets/deputes/ et assets/senateurs/ : dossiers des portraits officiels (voir LISEZ-MOI.txt)

PHOTOS DES DÉPUTÉS
Ajoutez les portraits officiels dans assets/deputes/, nommés avec l'identifiant Assemblée nationale (ex. PA795326.jpg). Ils s'affichent automatiquement ; sinon, une silhouette neutre apparaît.

SIMULATEUR
Les scénarios enregistrés et les réglages restent dans le navigateur de chaque visiteur (localStorage).

Les données et calculs de l’original n’ont pas été réinterprétés. La carte mondiale et les polices nécessitent une connexion internet (bibliothèques chargées par CDN).

VEILLE PARLEMENTAIRE
Fonctionnement : aucun serveur, aucune base de données, aucun coût. Quand un visiteur ouvre la rubrique, son navigateur lit directement l'API publique et gratuite de Bluesky pour chaque compte collecté, puis garde le résultat 10 minutes (sessionStorage). Les publications supprimées par leur auteur disparaissent d'elles-mêmes. Aucune clé d'API n'est nécessaire, donc aucun secret n'est à protéger.

Réseaux :
- Bluesky : collecte automatique des comptes de la liste Bluesky de référence (voir COLLECTE AUTOMATIQUE BLUESKY).
- LinkedIn : sélection manuelle (aucune API ne permet de lire les publications d'autrui ; l'aspiration de pages est interdite par LinkedIn).
- Instagram : sélection manuelle. La collecte automatique gratuite (API « Business Discovery » de Meta) demande un serveur qui garde une clé secrète : possible seulement si le site est déployé depuis GitHub (fonctions Netlify), pas par glisser-déposer.
- X : liens vers les profils. API payante à l'usage depuis février 2026 ; non activée par choix.
- Facebook : liens vers les profils (accès réservé aux applications agréées par Meta).
- YouTube : aucune chaîne personnelle mentionnée sur les fiches officielles.

Ajouter une publication LinkedIn ou Instagram (data/veille/selection.json) :
1. Ouvrez la publication sur LinkedIn ou Instagram et copiez son adresse.
   - LinkedIn : bouton « Partager » puis « Copier le lien », ou menu « … » puis « Intégrer cette publication » (vous pouvez coller le code d'intégration complet).
   - Instagram : menu « … » puis « Copier le lien ».
2. Ajoutez une entrée dans la liste "publications", par exemple :
   {"parlementaire": "PA721004", "reseau": "linkedin", "url": "ADRESSE COPIÉE", "ajoute_le": "2026-11-20"},
   {"parlementaire": "PA842311", "reseau": "instagram", "url": "ADRESSE COPIÉE", "date": "2026-11-18"}
   - "parlementaire" : identifiant AN (PA…) ou Sénat, comme dans comptes.json.
   - "date" : obligatoire pour Instagram (AAAA-MM-JJ) ; calculée automatiquement pour LinkedIn.
   - "extrait" (facultatif) : texte copié MOT POUR MOT depuis la publication. Il sert à la recherche et au classement par thème. N'écrivez jamais de résumé ni de reformulation.
3. Séparez les entrées par une virgule, sans virgule après la dernière. Redéposez le dossier sur Netlify.
Contrôles automatiques : une entrée est ignorée si le parlementaire n'a pas de compte vérifié sur ce réseau, si l'adresse n'est pas une publication du réseau, si la date manque (Instagram) ou si l'adresse LinkedIn provient d'un autre compte que le compte vérifié. Les entrées ignorées et la raison s'affichent dans l'onglet « Couverture des sources ».
Les publications choisies s'affichent seulement quand le visiteur clique (protection des données : le chargement contacte LinkedIn ou Instagram).

Mettre à jour les comptes (data/veille/comptes.json) :
- Chaque parlementaire est identifié par son identifiant Assemblée nationale (PA…) ou Sénat (comme dans deputes-2026.json et senateurs-2026.json). Après une élection, ajoutez l'entrée du nouvel élu avec le même identifiant que dans ces fichiers.
- Un compte n'apparaît sur le site que si "verification" vaut "verifie". N'utilisez cette valeur que si le compte figure sur la fiche officielle de l'Assemblée ou du Sénat, sur le site officiel du parlementaire, ou s'il est certifié par la plateforme. Renseignez alors "source", "source_url" et "verifie_le".
- Un compte n'est collecté que si "collecte" vaut true ET qu'un connecteur existe pour son réseau (aujourd'hui : bluesky). Pour Bluesky, indiquez aussi le "did" (identifiant permanent, visible sur https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=NOM.bsky.social).
- Comptes Bluesky repérés mais non confirmés (statut "a_verifier", non affichés) : Anne Genetet, Vincent Caure, Pieyre-Alexandre Anglade, Frédéric Petit, Karim Ben Cheikh, Hélène Conway-Mouret, Mathilde Ollivier, Sophie Briante Guillemont, Yan Chantrel. Pour activer l'un d'eux une fois confirmé (par exemple par son équipe ou par un lien sur son site officiel) : passez "verification" à "verifie", "collecte" à true, et complétez "source", "source_url" et "verifie_le".

Thèmes (data/veille/themes.json) : liste de mots-clés par thème, comparés sans accents ni majuscules ; « * » remplace une fin de mot. Après modification, lancez les tests. Le classement est descriptif : il signale qu'un sujet est mentionné, jamais une position.

Ajouter un réseau : dans veille.js, ajoutez une entrée à CONNECTORS avec une fonction fetchPage(compte, curseur) qui renvoie {posts, cursor} au format commun décrit en tête de fichier. Le reste de l'interface (fil, filtres, fiches, couverture) s'adapte sans autre modification. Un réseau qui exige une clé secrète (Instagram, X) ne peut pas être interrogé depuis le navigateur : il faudra une fonction serveur (par exemple Netlify Functions, gratuite dans les limites de l'offre de base) qui garde la clé.

Tests : node tests/veille.test.mjs (Node.js 18 ou plus récent).

Données personnelles : l'affichage de la rubrique fait contacter les serveurs de Bluesky par le navigateur du visiteur (adresse IP transmise). Cette information figure dans l'onglet « Couverture des sources ». Pensez à la reprendre dans les mentions légales du site.

COLLECTE AUTOMATIQUE BLUESKY
Principe. La liste Bluesky indiquée dans data/veille/config.json est la référence : ajoutez ou retirez un compte de cette liste sur Bluesky, la collecte suit au passage suivant (un compte retiré n'est plus collecté, son historique est conservé). Toutes les 30 minutes, GitHub Actions lance collecteur/bluesky-liste.mjs, qui interroge uniquement l'API publique officielle de Bluesky (sans compte ni mot de passe) :
- app.bsky.graph.getList : membres de la liste ;
- app.bsky.feed.getListFeed : nouvelles publications des membres ;
- app.bsky.feed.getAuthorFeed (pour chaque membre) : republications, rattrapage après une panne, historique d'un membre ajouté (au moins 90 jours), détection des publications supprimées. Ce complément est nécessaire : getListFeed ne renvoie que des publications récentes, sans pagination ni republications.
Chaque publication est vérifiée (publiée ou republiée par un membre de la liste), identifiée de façon unique (pas de doublon) et enregistrée dans data/veille/bluesky/AAAA-MM.json. L'état (membres, dernière synchronisation, journal des 100 derniers passages) est dans data/veille/bluesky/etat.json. Le site affiche ces fichiers ; s'ils sont absents, il lit la liste directement auprès de Bluesky (sans historique).
Coût : 0 €. GitHub Actions est gratuit et illimité pour un dépôt public ; chaque passage dure moins d'une minute (environ 11 requêtes à l'API Bluesky).

MISE EN SERVICE (une seule fois, environ 15 minutes)
1. Créez un compte gratuit sur https://github.com, puis un dépôt PUBLIC (bouton « New repository »), par exemple « observatoire-electoral ». Le dépôt doit être public : le site y lit l'historique, et les minutes de GitHub Actions y sont illimitées.
2. Envoyez le contenu du dossier Observatoire-electoral dans le dépôt :
   - le plus simple : page du dépôt → « uploading an existing file » → glissez TOUT le contenu du dossier (y compris le dossier .github ; sur Mac, affichez les fichiers cachés dans le Finder avec Cmd + Maj + point) → « Commit changes » ;
   - ou, si vous utilisez Git : git init, git add -A, git commit -m "Observatoire", git remote add origin https://github.com/UTILISATEUR/DEPOT.git, git push -u origin main.
   Vérifiez que le fichier .github/workflows/veille-bluesky.yml apparaît bien dans le dépôt.
3. Dans le dépôt : onglet « Settings » → « Actions » → « General » → « Workflow permissions » → cochez « Read and write permissions » → « Save ». (Sans cela, la collecte ne peut pas enregistrer l'historique.)
4. Onglet « Actions » : si GitHub le demande, cliquez « I understand my workflows, go ahead and enable them ». Puis « Veille Bluesky » → « Run workflow » pour lancer une première collecte. Au bout d'une minute, la coche verte indique la réussite et un nouvel enregistrement « Veille Bluesky : synchronisation… » apparaît dans le dépôt.
5. Dans data/veille/config.json (sur GitHub : ouvrez le fichier, icône crayon), renseignez :
   "donnees_distantes": "https://raw.githubusercontent.com/UTILISATEUR/DEPOT/main/data/veille/bluesky/"
   en remplaçant UTILISATEUR et DEPOT (et main par le nom de votre branche s'il diffère). Enregistrez (« Commit changes »).
6. Publiez le site sur Netlify comme d'habitude (glisser-déposer du dossier, après avoir reporté la même modification de config.json dans votre copie locale), ou mieux : reliez Netlify au dépôt GitHub (« Add new site » → « Import an existing project »). Le fichier netlify.toml empêche alors un redéploiement toutes les 30 minutes : seules vos propres modifications redéploient le site.
À partir de là, le site affiche les nouvelles publications sans aucune intervention (délai : 30 minutes de collecte + 5 minutes de cache GitHub au maximum). Votre ordinateur peut rester éteint.

Contrôler que tout fonctionne : rubrique Veille parlementaire → « Couverture des sources » (dernière synchronisation, membres de la liste, journal des passages). Le bandeau du fil signale « collecte automatique en retard » si aucune synchronisation n'a réussi depuis 3 heures. Sur GitHub, l'onglet « Actions » liste chaque passage ; GitHub vous prévient par e-mail en cas d'échec.
Bon à savoir : GitHub peut retarder de quelques minutes les tâches programmées aux heures chargées. Il suspend les tâches programmées d'un dépôt public après 60 jours sans activité ; les enregistrements de la collecte comptent normalement comme activité, mais si la collecte s'arrête, relancez-la depuis l'onglet « Actions ».

Changer de liste : remplacez le lien "liste" dans data/veille/config.json (lien copié depuis bsky.app, de la forme https://bsky.app/profile/…/lists/…). Les membres sont rattachés aux fiches des parlementaires par leur identifiant Bluesky (champ "did" dans comptes.json), sinon par leur nom exact ; un compte non reconnu s'affiche sous son nom Bluesky, signalé « non rattaché ».

Lancer et tester sur votre ordinateur (facultatif, Node.js 20 ou plus récent, https://nodejs.org) :
   cd ~/Desktop/Observatoire-electoral
   node tests/veille.test.mjs && node tests/collecteur.test.mjs
   node collecteur/bluesky-liste.mjs --simulation      (interroge Bluesky, n'écrit rien)
   node collecteur/bluesky-liste.mjs                   (collecte réelle dans data/veille/bluesky/)
   python3 -m http.server 8000                         (puis http://localhost:8000/#veille)

COLLECTE AUTOMATIQUE INSTAGRAM
Principe. GitHub Actions (.github/workflows/veille-instagram.yml) lance collecteur/instagram.mjs toutes les heures de 6 h à 23 h (heure de Paris). Le collecteur utilise l'API officielle « Business Discovery » de Meta avec le jeton de la page de l'Observatoire : il lit les publications et Reels publics des comptes Instagram vérifiés de data/veille/comptes.json (16 requêtes par passage ; limite de Meta : 200 par heure). Historique : data/veille/instagram/AAAA-MM.json (un fichier par mois, sans doublon) et data/veille/instagram/etat.json. Le site les affiche dans le fil de veille (intégration officielle d'Instagram chargée au clic).
Récapitulatif. À 8 h et 19 h (et à chaque lancement manuel), toutes les publications détectées depuis le récapitulatif précédent (auteur, date, Photo/Vidéo/Carrousel/Reel, lien, début de la légende) sont publiées en commentaire de l'issue « Veille Instagram : récapitulatifs » du dépôt. GitHub vous envoie chaque commentaire par e-mail (vous êtes assigné à cette issue ; ne la fermez pas). Le récapitulatif signale aussi les comptes non lisibles et les comptes collectés pour la première fois, avec le nom affiché par Instagram, pour contrôle.
Limites. Seuls les comptes PROFESSIONNELS (Business ou Créateur) sont lisibles ; un compte personnel apparaît « non lisible » (à suivre par les notifications de l'application Instagram et la sélection manuelle). Les Stories ne sont pas accessibles. Les images ne sont pas copiées.

Mise en service (une seule fois) :
1. Secret : dépôt GitHub → Settings → Secrets and variables → Actions → New repository secret → nom IG_TOKEN, valeur : le jeton de PAGE de l'Observatoire (outil de débogage Meta : « Type : Page », « Expire : Jamais »). Ne le placez jamais dans un fichier du dépôt.
2. Déposez les fichiers fournis (voir la liste dans le message d'accompagnement) en respectant leurs dossiers.
3. Onglet « Actions » → « Veille Instagram » → « Run workflow ». Au bout d'une minute : coche verte, nouvel enregistrement « Veille Instagram : synchronisation… », et une issue « Veille Instagram : récapitulatifs » avec le premier récapitulatif (comptes collectés pour la première fois : vérifiez les noms affichés).
4. Vérifiez que vous recevez les e-mails : github.com → Settings → Notifications → « Email » coché pour « Participating, @mentions and custom ».

Réglages (data/veille/config.json → instagram) : ig_user_id (identifiant du compte Instagram professionnel de l'Observatoire, non secret), version_api (version de l'API Graph, à faire évoluer quand Meta l'annonce), historique_initial_jours (90), recap_vide (true : un récapitulatif est publié même sans nouvelle publication).
Ajouter ou retirer un compte : dans data/veille/comptes.json, entrée « reseau": "instagram" du parlementaire, avec "verification": "verifie" et "collecte": true (ou false pour arrêter la collecte ; l'historique est conservé).
Changer d'horaires : dans .github/workflows/veille-instagram.yml, étape « Créneau (heure de Paris) » (plage de collecte et heures du récapitulatif).

En cas de problème (indiqué en tête du récapitulatif) :
- « Jeton Instagram invalide ou expiré » : le jeton a été révoqué (changement de mot de passe Facebook, retrait de l'application, réglage de sécurité). Régénérez-le dans l'Explorateur de l'API Graph (permissions pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights, ads_read, business_management ; cocher la page et le compte Instagram), étendez-le, obtenez le jeton de page (requête 1543772145476598?fields=access_token) et remplacez le secret IG_TOKEN.
- « Permission manquante » : même procédure, en vérifiant les six permissions.
- « Limite de requêtes de Meta atteinte » : rien à faire, la collecte reprend au passage suivant.
Tests : node tests/instagram.test.mjs (API simulée, aucune requête réelle).
