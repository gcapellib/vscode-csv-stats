import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { placeLabels, type LabelBox } from '../core/labels';

const middle = (x: number, width: number): LabelBox => ({ x, width, anchor: 'middle' });

/** Aucune paire d'étiquettes d'une même ligne ne se touche. */
function overlaps(boxes: LabelBox[], min: number, max: number): boolean {
  const placed = placeLabels(boxes, min, max);
  return placed.some((a, i) => placed.some((b, j) => j > i && a.row === b.row && a.left < b.left + boxes[j].width && b.left < a.left + boxes[i].width));
}

describe('placement des étiquettes', () => {
  it('laisse sur une seule ligne ce qui tient', () => {
    const placed = placeLabels([middle(60, 50), middle(170, 50), middle(280, 50)], 2, 338);
    assert.deepEqual(placed.map((p) => p.row), [0, 0, 0]);
  });

  it('centre chaque étiquette sur son repère', () => {
    assert.equal(placeLabels([middle(100, 40)], 2, 338)[0].left, 80);
    assert.equal(placeLabels([{ x: 100, width: 40, anchor: 'start' }], 2, 338)[0].left, 100);
    assert.equal(placeLabels([{ x: 100, width: 40, anchor: 'end' }], 2, 338)[0].left, 60);
  });

  it('rabat dans les bords une étiquette trop près de l’un d’eux', () => {
    assert.equal(placeLabels([middle(5, 60)], 2, 338)[0].left, 2);
    assert.equal(placeLabels([middle(335, 60)], 2, 338)[0].left, 278);
  });

  it('descend d’une ligne pour chaque étiquette qui toucherait les précédentes, sans limite', () => {
    // Trois quartiles à quelques pixels l'un de l'autre — le cas d'une colonne resserrée : trois lignes.
    const placed = placeLabels([middle(150, 70), middle(156, 80), middle(162, 70)], 2, 338);
    assert.deepEqual(placed.map((p) => p.row), [0, 1, 2]);
    const five = placeLabels([middle(150, 70), middle(152, 70), middle(154, 70), middle(156, 70), middle(158, 70)], 2, 338);
    assert.deepEqual(five.map((p) => p.row), [0, 1, 2, 3, 4]);
  });

  it('réutilise une ligne dès que la place est libre', () => {
    const placed = placeLabels([middle(60, 70), middle(70, 70), middle(280, 70)], 2, 338);
    assert.deepEqual(placed.map((p) => p.row), [0, 1, 0]);
  });

  it('ne recouvre jamais rien, quelles que soient les positions', () => {
    let state = 7;
    const random = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let round = 0; round < 500; round++) {
      const boxes = Array.from({ length: 1 + Math.floor(random() * 6) }, () => middle(random() * 340, 20 + random() * 70));
      assert.equal(overlaps(boxes, 2, 338), false, JSON.stringify(boxes));
    }
  });
});
