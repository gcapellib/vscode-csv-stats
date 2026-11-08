/**
 * Placer des étiquettes de texte sans qu'aucune n'en recouvre une autre.
 *
 * Les graphiques écrivent des chiffres à des positions que les données dictent : trois quartiles
 * d'une colonne resserrée tombent à quelques pixels l'un de l'autre, une borne d'outliers peut
 * coller le maximum. À largeur fixe, aucune disposition ne convient à tous les fichiers ; la règle
 * est donc la même pour tous : chaque étiquette se centre sur son repère (ou s'y aligne), se
 * rabat dans les bords, et prend la première ligne où elle ne touche aucune de celles déjà posées,
 * avec un écart. Le nombre de lignes n'est pas limité d'avance : le graphique s'agrandit de ce qu'il faut.
 */
export interface LabelBox {
  /** Le repère qu'elle désigne. */
  x: number;
  width: number;
  /** Où le texte se tient par rapport au repère. */
  anchor: 'start' | 'middle' | 'end';
}

export interface Placed {
  /** Le bord gauche du texte, bords respectés. */
  left: number;
  /** 0 pour la ligne la plus proche du graphique, puis 1, 2… */
  row: number;
}

export function placeLabels(boxes: LabelBox[], min: number, max: number, gap = 4): Placed[] {
  const placed: Placed[] = [];
  const widths: number[] = [];
  for (const box of boxes) {
    const wanted = box.anchor === 'start' ? box.x : box.anchor === 'end' ? box.x - box.width : box.x - box.width / 2;
    // Plus large que la place : alignée sur le bord gauche, elle déborde plutôt que de se coller à droite.
    const left = Math.max(min, Math.min(wanted, max - box.width));
    let row = 0;
    while (placed.some((other, i) => other.row === row && left < other.left + widths[i] + gap && other.left < left + box.width + gap)) row++;
    placed.push({ left, row });
    widths.push(box.width);
  }
  return placed;
}
