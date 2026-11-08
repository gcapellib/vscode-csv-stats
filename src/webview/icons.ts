/**
 * Petites icônes tracées, à la couleur du texte qui les entoure.
 *
 * Un caractère (▾, ⇅) suffit pour filtrer et trier ; un balai et un graphique
 * n'existent pas en caractère sûr — l'emoji 🧹 change de taille et de couleur
 * d'une police à l'autre. Un trait en `currentColor` suit la palette. Le
 * graphique et la copie reprennent le dessin des icônes Tabler (licence MIT),
 * celles de la maquette validée.
 */
const SVG = 'http://www.w3.org/2000/svg';

interface Glyph {
  viewBox: string;
  paths: string[];
}

export type IconName = 'sparkles' | 'chart' | 'copy' | 'code' | 'list' | 'exchange' | 'alert' | 'grid' | 'back' | 'trim' | 'eyeOff' | 'merge' | 'edit' | 'ban' | 'fillDown' | 'fillUp' | 'drop' | 'trash' | 'ruler' | 'dots';

const GLYPHS: Record<IconName, Glyph> = {
  // Tabler « sparkles » : l'icône de nettoyage de la maquette validée.
  sparkles: {
    viewBox: '0 0 24 24',
    paths: [
      'M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z',
    ],
  },
  // Tabler « chart-bar » : trois barres en contour sur une ligne de base.
  chart: {
    viewBox: '0 0 24 24',
    paths: [
      'M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
      'M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
      'M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
      'M4 20h14',
    ],
  },
  // Tabler « code » : le code pandas.
  code: { viewBox: '0 0 24 24', paths: ['M7 8l-4 4l4 4', 'M17 8l4 4l-4 4', 'M14 4l-4 16'] },
  // Tabler « list » : les colonnes.
  list: { viewBox: '0 0 24 24', paths: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M5 6v.01', 'M5 12v.01', 'M5 18v.01'] },
  // Tabler « arrows-exchange » : deux colonnes liées.
  exchange: { viewBox: '0 0 24 24', paths: ['M7 10h14l-4 -4', 'M17 14h-14l4 4'] },
  // Tabler « alert-triangle » : les constats.
  alert: {
    viewBox: '0 0 24 24',
    paths: ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z', 'M12 16h.01'],
  },
  // Quatre cases : la carte de chaleur.
  grid: { viewBox: '0 0 24 24', paths: ['M4 4h7v7h-7z', 'M13 4h7v7h-7z', 'M4 13h7v7h-7z', 'M13 13h7v7h-7z'] },
  // Tabler « arrow-left ».
  back: { viewBox: '0 0 24 24', paths: ['M5 12h14', 'M5 12l6 6', 'M5 12l6 -6'] },
  // Tracés simples, dans le style Tabler, pour les gestes du menu de colonne.
  trim: { viewBox: '0 0 24 24', paths: ['M4 6v12', 'M20 6v12', 'M9 9l-3 3l3 3', 'M15 9l3 3l-3 3'] },
  eyeOff: {
    viewBox: '0 0 24 24',
    paths: ['M10.585 10.587a2 2 0 0 0 2.829 2.828', 'M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87', 'M3 3l18 18'],
  },
  merge: { viewBox: '0 0 24 24', paths: ['M5 4l7 7v9', 'M19 4l-7 7', 'M9 16l3 3l3 -3'] },
  edit: { viewBox: '0 0 24 24', paths: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'] },
  ban: { viewBox: '0 0 24 24', paths: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M5.7 5.7l12.6 12.6'] },
  fillDown: { viewBox: '0 0 24 24', paths: ['M12 4v12', 'M7 12l5 5l5 -5', 'M5 20h14'] },
  fillUp: { viewBox: '0 0 24 24', paths: ['M12 20v-12', 'M7 12l5 -5l5 5', 'M5 4h14'] },
  drop: {
    viewBox: '0 0 24 24',
    paths: ['M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z'],
  },
  trash: { viewBox: '0 0 24 24', paths: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'] },
  ruler: { viewBox: '0 0 24 24', paths: ['M3 8h18v8h-18z', 'M7 8v3', 'M11 8v4', 'M15 8v3'] },
  dots: { viewBox: '0 0 24 24', paths: ['M5 12v.01', 'M12 12v.01', 'M19 12v.01'] },
  // Tabler « copy ».
  copy: {
    viewBox: '0 0 24 24',
    paths: [
      'M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z',
      'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1',
    ],
  },
};

export function icon(name: IconName, size = 14): SVGSVGElement {
  const glyph = GLYPHS[name];
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', glyph.viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', glyph.viewBox === '0 0 24 24' ? '1.6' : '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of glyph.paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
