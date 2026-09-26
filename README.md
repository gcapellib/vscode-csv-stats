# CSV Stats — extension VS Code

Un aperçu statistique des fichiers CSV directement dans l'éditeur.

Clic droit sur un fichier `.csv` dans l'explorateur → **Open in CSV Stats**.

L'interface est **en anglais**, nombres compris : séparateur de milliers par
virgule et point décimal. Le tableau, lui, montre les cellules telles qu'elles
sont écrites dans le fichier.

## Ce que montre l'onglet

Au-dessus de chaque colonne, un bandeau donne :

- le type détecté — **numeric** ou **text** ;
- le nombre et le pourcentage de valeurs manquantes ;
- le nombre et le pourcentage de valeurs distinctes ;
- pour une colonne numérique, un histogramme de 20 classes, puis **min à gauche
  et max à droite** ; survoler une barre affiche l'intervalle de la classe et son
  effectif, et survoler le reste du bandeau donne le nom complet de la colonne et
  son résumé ;
- pour une colonne texte, les trois valeurs les plus fréquentes et leur part,
  suivies d'une ligne **Other** portant le reste — les pourcentages totalisent
  donc toujours 100 %.

En dessous, le tableau des données : tri par clic sur l'en-tête, et seules les
lignes visibles sont rendues, ce qui garde l'affichage fluide à cent mille
lignes.

## Menu de colonne

Trois points en haut à droite de chaque bandeau : tri croissant ou décroissant,
filtre « contient », renommage, retrait de la colonne, bascule du type détecté,
et masquage du bandeau.

Ce sont toutes des **actions de vue** : le fichier n'est jamais réécrit. Rouvrir
l'onglet rend l'état d'origine. Forcer le type en « numeric » retient les seules
valeurs qui se lisent comme des nombres, sans exiger qu'elles le soient toutes —
c'est bien le propos d'un forçage manuel.

## Palettes

Un sélecteur propose **quarante palettes**, en trois familles : fond coloré et
texte uni (vingt), fond uni et texte coloré par colonne à la manière d'une
coloration syntaxique (dix), et les deux à la fois (dix). Le choix est retenu
d'une session à l'autre.

## Règles de lecture


- Le délimiteur est détecté entre la virgule et le point-virgule, en comptant les
  occurrences hors guillemets sur les premières lignes : c'est la **régularité**
  du compte qui décide, pas son volume.
- Dans un fichier à point-virgule, la virgule est traitée comme séparateur
  décimal ; dans un fichier à virgule, elle ne l'est pas.
- Une colonne est numérique seulement si **toutes** ses valeurs renseignées se
  lisent comme des nombres. Les espaces, y compris insécables, sont tolérés comme
  séparateurs de milliers.
- Une cellule vide ou uniquement composée d'espaces compte comme manquante.
- Une ligne entièrement blanche n'est pas une ligne de données : elle est ignorée,
  tout comme le saut de ligne final.
- Le BOM UTF-8 est retiré. L'encodage attendu est UTF-8.
- Au-delà de 500 000 lignes, la table est tronquée et l'onglet l'annonce.

Le fichier est lu et analysé dans l'hôte d'extension, pas dans la vue, et les
lignes lui parviennent par paquets : l'interface reste réactive pendant tout le
chargement.

## Construire

```bash
npm install
npm test       # parsing, statistiques et palettes
npm run build  # bundles dist/extension.js et dist/webview.js
npm run package  # produit csv-stats-<version>.vsix
```

## Installer

```bash
code --install-extension csv-stats-0.2.0.vsix
```

Ou, dans VS Code : vue **Extensions** → `…` → **Install from VSIX…**
