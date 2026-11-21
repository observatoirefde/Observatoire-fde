
# Observatoire électoral des Français de l’étranger

Un projet indépendant de visualisation, d’analyse et de suivi de la représentation politique des Français établis hors de France.

L’observatoire centralise les résultats électoraux, les données relatives aux élus et l’actualité parlementaire dans une interface interactive accessible à tous.

## Fonctionnalités

- Cartographie interactive en 2D et 3D des 11 circonscriptions législatives.
- Résultats des élections législatives de 2022 et 2024 et des élections consulaires de 2026.
- Annuaires des députés, sénateurs, conseillers des Français de l’étranger et conseillers à l’Assemblée des Français de l’étranger (AFE).
- Simulateur des élections législatives de 2027, avec hypothèses personnalisables.
- Veille parlementaire : suivi des publications publiques, collecte automatisée sur Bluesky et classement thématique.

## Lancer le site en local

Cloner ou télécharger le dépôt, ouvrir un terminal dans son dossier, puis lancer :

```bash
python3 -m http.server 8000
```

Ouvrir ensuite [http://localhost:8000](http://localhost:8000) dans un navigateur. Une connexion Internet est nécessaire pour les bibliothèques cartographiques et la veille en ligne.

## Architecture

| Fichier ou dossier | Fonction |
| --- | --- |
| `index.html` | Interface du site |
| `style.css` | Présentation graphique |
| `app.js` | Cartes, résultats et simulations |
| `data/` | Données électorales, annuaires et publications |
| `assets/` | Portraits et ressources visuelles |
| `veille.js` et `veille-bluesky.js` | Veille parlementaire |
| `collecteur/` | Collecte automatisée Bluesky |
| `.github/workflows/` | Automatisation GitHub Actions |
| `tests/` | Tests de la veille et du collecteur |

Le projet repose sur HTML, CSS et JavaScript, avec ECharts et D3 pour la cartographie. Il peut être hébergé sur GitHub Pages sans serveur applicatif dédié.

## Mise à jour des données

Les données sont stockées au format JSON. La collecte Bluesky est programmée via GitHub Actions toutes les 30 minutes, sous réserve de l’activation du workflow et de sa configuration. Les publications Instagram et LinkedIn sont sélectionnées manuellement.

Pour lancer les tests (Node.js requis) :

```bash
node --test tests/*.test.mjs
```

## Sources et méthodologie

Les données proviennent notamment du ministère de l’Europe et des Affaires étrangères, du ministère de l’Intérieur, de l’Assemblée nationale, du Sénat et de l’Assemblée des Français de l’étranger. Les sources et précisions méthodologiques sont indiquées dans l’observatoire.

Les simulations électorales constituent des hypothèses de travail et non des prévisions. La veille repose sur des publications publiques ; leur classement thématique ne constitue pas une appréciation des opinions des élus.

Ce projet indépendant n’est pas un site officiel de l’administration française.
