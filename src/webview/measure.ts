/**
 * La largeur qu'un texte prendra à l'écran, dans la police du panneau.
 *
 * Un graphique SVG se construit avant d'être posé dans la page, où `getBBox` ne dit rien :
 * un canevas mesure la même chose sans rien attendre. Sans canevas, une estimation prudente.
 */
let context: CanvasRenderingContext2D | null | undefined;
let family = '';

export function textWidth(text: string, size: number, weight = 400): number {
  if (context === undefined) {
    context = document.createElement('canvas').getContext('2d');
    family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  }
  if (!context) return text.length * size * 0.62;
  context.font = `${weight} ${size}px ${family}`;
  return context.measureText(text).width;
}
