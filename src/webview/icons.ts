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

const GLYPHS: Record<'sparkles' | 'chart' | 'copy', Glyph> = {
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
  // Tabler « copy ».
  copy: {
    viewBox: '0 0 24 24',
    paths: [
      'M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z',
      'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1',
    ],
  },
};

export function icon(name: keyof typeof GLYPHS, size = 14): SVGSVGElement {
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
