# Module autonome : suivi législatif FDE

## Ouvrir la page immédiatement

Ouvrir `suivi-legislatif-fde.html` dans un navigateur. Le dernier instantané des données est intégré dans le fichier HTML : aucune installation n'est nécessaire.

## Installer sur l'Observatoire FDE (GitHub Pages)

1. Décompresser l'archive à la **racine** du dépôt `observatoirefde/Observatoire-fde`, en conservant les dossiers `scripts/` et `.github/workflows/` (y compris le dossier masqué `.github`). Ne supprimer aucun fichier existant.
2. Remplacer `index.html`, `app.js` et `veille.js` par les versions fournies : elles sont basées sur le site public du 21 novembre 2026. La rubrique « Activité des parlementaires des Français de l'étranger » possède deux sous-rubriques : « Réseaux sociaux » et « Activité législative ». La carte d'accueil démarre en 3D, avec un repli en 2D en cas d'indisponibilité du globe. Si vous avez modifié ces fichiers depuis, fusionnez les changements avant remplacement.
3. Committer et pousser les fichiers vers la branche par défaut. L'onglet sera accessible sur `https://observatoirefde.github.io/Observatoire-fde/#legislatif` après publication initiale. La page peut aussi être ouverte séparément.
4. Dans GitHub, onglet **Actions**, choisir « Actualiser le suivi législatif FDE » puis **Run workflow**. Le dépôt doit autoriser les workflows à écrire dans la branche (respecter les éventuelles règles de protection).

La couverture détaillée des sources n'est plus une route publique ni une vue du site. Le fichier séparé `couverture-sources-privee.html` doit rester sur votre ordinateur, hors du dépôt public. Les fichiers de données déjà publics sur GitHub demeurent publics : cette séparation ne constitue pas une authentification serveur.

Le workflow est planifié chaque jour à 05 h 17 UTC (06 h 17 en hiver, 07 h 17 en été). L'heure d'exécution réelle dépend de GitHub. Aucun compte d'API parlementaire ni aucune clé payante n'est nécessaire.

La page hébergée récupère `legislatif-data.json` directement depuis le dépôt public (branche par défaut via HEAD). Cela permet de lire les mises à jour sans dépendre d'un redéploiement GitHub Pages déclenché par les commits d'un workflow. L'instantané embarqué reste disponible si le chargement distant échoue.

## Collecte manuelle

Depuis la racine du projet, exécuter `python3 scripts/refresh_legislatif.py`. Le script actualise le HTML et le JSON. Il emploie uniquement la bibliothèque standard Python.

## Périmètre et méthode

- Propositions de loi ordinaires déposées depuis juillet 2024, dont le premier auteur est identifié dans la liste officielle des députés et sénateurs FDE actuellement en fonction, ou dont le titre correspond à des mots-clés FDE. La détection thématique n'est pas exhaustive ; les cosignatures seules ne suffisent pas à qualifier un texte de « porté par » un élu FDE.
- Assemblée nationale : actes datés et déposants issus de l'open data de la XVIIe législature. Les actes futurs sont séparés de l'historique. Les catégories d'avancement sont une synthèse prudente des actes enregistrés et non une prévision.
- Sénat : état officiel DOSLEG, textes et auteurs, événements disponibles dans les données croisées de l'Assemblée et décisions explicitement datées sur certains dossiers officiels.
- Les dates absentes ne sont pas inventées. Le dossier officiel lié reste la référence.
- Une rupture dans une source empêche la réécriture du corpus. Le navigateur conserve le dernier instantané intégré si le JSON distant est inaccessible.

Sources : [Assemblée nationale – dossiers législatifs](https://data.assemblee-nationale.fr/travaux-parlementaires/dossiers-legislatifs), [députés actifs](https://data.assemblee-nationale.fr/acteurs/deputes-en-exercice), [Sénat – DOSLEG](https://data.senat.fr/dosleg/), [sénateurs FDE](https://www.senat.fr/senateurs/senateurs_representant_les_francais_etablis_hors_de_france.html).
