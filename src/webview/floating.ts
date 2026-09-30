/**
 * Un seul registre pour tout ce qui flotte : le menu « ⋯ », le sélecteur de
 * thème, le panneau (filtre / Column details / Dataset).
 *
 * Trois gestionnaires « clic à l'extérieur » indépendants existaient avant,
 * chacun avec ses propres exceptions écrites à des moments différents — le
 * panneau n'avait pas la sienne, ce qui a laissé un bug (le second clic ne
 * refermait rien) survivre plusieurs versions avant d'être corrigé en 0.15.1.
 * Une seule implémentation ne peut plus diverger de cette façon.
 *
 * Le contrat qu'elle applique : un seul panneau ouvert à la fois — déjà vrai
 * avant elle, mais comme propriété *émergente* de trois écouteurs qui se
 * fermaient chacun de son côté. Ici c'est une garantie explicite, plutôt
 * qu'un heureux hasard d'ordonnancement.
 */

/** Le strict nécessaire d'un élément flottant : pas de dépendance au DOM réel,
 * pour que ce module reste testable avec de simples objets. */
export interface FloatingElement {
  hidden: boolean;
  contains(target: unknown): boolean;
}

export interface FloatingPanel {
  element: FloatingElement;
  /** Nettoyage propre à ce panneau, appelé juste après l'avoir masqué. */
  onClose?: () => void;
}

export class FloatingManager {
  private panels = new Map<string, FloatingPanel>();
  private openId: string | null = null;
  /**
   * Le bouton qui a ouvert le panneau courant, exempté du clic extérieur.
   *
   * Sans cette exception, un vrai clic souris ferme le panneau *avant* que le
   * clic n'atteigne ce bouton — qui le rouvre aussitôt : la bascule semble ne
   * jamais fonctionner. Un clic programmatique (nos propres tests) ne révèle
   * pas ce défaut, ce qui l'a longtemps laissé passer inaperçu.
   */
  private toggleAnchor: FloatingElement | null = null;

  register(id: string, panel: FloatingPanel): void {
    this.panels.set(id, panel);
  }

  isOpen(id: string): boolean {
    return this.openId === id;
  }

  get current(): string | null {
    return this.openId;
  }

  /** Ouvre un panneau, refermant d'abord celui qui l'était, s'il y en avait un autre. */
  open(id: string, opener: FloatingElement | null = null): void {
    if (this.openId !== null && this.openId !== id) this.close();
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.element.hidden = false;
    this.openId = id;
    this.toggleAnchor = opener;
  }

  close(): void {
    if (this.openId === null) return;
    const panel = this.panels.get(this.openId);
    this.openId = null;
    this.toggleAnchor = null;
    if (!panel) return;
    panel.element.hidden = true;
    panel.onClose?.();
  }

  /** Un second appel avec le même id referme plutôt que de rouvrir. */
  toggle(id: string, opener: FloatingElement | null = null): void {
    if (this.isOpen(id)) {
      this.close();
      return;
    }
    this.open(id, opener);
  }

  /** À appeler depuis un seul écouteur `mousedown` global. */
  handleOutsideClick(target: unknown): void {
    if (this.openId === null) return;
    const panel = this.panels.get(this.openId);
    if (!panel) return;
    if (panel.element.contains(target)) return;
    if (this.toggleAnchor?.contains(target)) return;
    this.close();
  }
}
