/**
 * Une couleur CSS quelconque (`#rgb`, `rgb()`, `color-mix()`, `var()` déjà résolue),
 * lue comme « #rrggbb ». Le navigateur sait les lire toutes : un canevas les
 * ramène à une forme simple, sans qu'on réécrive un analyseur de couleurs.
 */
let context: CanvasRenderingContext2D | null | undefined;

export function cssToHex(value: string, fallback: string): string {
  if (context === undefined) context = document.createElement('canvas').getContext('2d');
  if (!context) return fallback;
  context.fillStyle = '#000000';
  context.fillStyle = value.trim() === '' ? fallback : value.trim();
  const written = String(context.fillStyle);
  if (/^#[0-9a-f]{6}$/i.test(written)) return written;
  const channels = written.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return fallback;
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** La valeur d'une variable CSS de VS Code, lue comme « #rrggbb ». */
export function themeColour(variable: string, fallback: string): string {
  return cssToHex(getComputedStyle(document.documentElement).getPropertyValue(variable), fallback);
}
