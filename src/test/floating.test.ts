import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { FloatingManager, type FloatingElement } from '../webview/floating';

/** Un élément flottant minimal, sans DOM : seul son propre nom compte pour `contains`. */
function fakeElement(name: string): FloatingElement {
  return {
    hidden: true,
    contains(target: unknown) {
      return target === name;
    },
  };
}

describe('FloatingManager', () => {
  it("ouvre un panneau : hidden passe à faux, isOpen le confirme", () => {
    const manager = new FloatingManager();
    const menu = fakeElement('menu');
    manager.register('menu', { element: menu });
    manager.open('menu');
    assert.equal(menu.hidden, false);
    assert.ok(manager.isOpen('menu'));
    assert.equal(manager.current, 'menu');
  });

  it('ferme le panneau ouvert : hidden repasse à vrai, onClose est appelé', () => {
    const manager = new FloatingManager();
    const menu = fakeElement('menu');
    let closed = 0;
    manager.register('menu', { element: menu, onClose: () => closed++ });
    manager.open('menu');
    manager.close();
    assert.equal(menu.hidden, true);
    assert.equal(manager.isOpen('menu'), false);
    assert.equal(manager.current, null);
    assert.equal(closed, 1);
  });

  it('fermer sans rien d’ouvert ne fait rien — ni erreur, ni onClose fantôme', () => {
    const manager = new FloatingManager();
    const menu = fakeElement('menu');
    let closed = 0;
    manager.register('menu', { element: menu, onClose: () => closed++ });
    manager.close();
    assert.equal(closed, 0);
  });

  it('un seul panneau ouvert à la fois : en ouvrir un second referme le premier', () => {
    const manager = new FloatingManager();
    const menu = fakeElement('menu');
    const theme = fakeElement('theme');
    manager.register('menu', { element: menu });
    manager.register('theme', { element: theme });
    manager.open('menu');
    manager.open('theme');
    assert.equal(menu.hidden, true);
    assert.equal(theme.hidden, false);
    assert.ok(manager.isOpen('theme'));
    assert.equal(manager.isOpen('menu'), false);
  });

  it('toggle referme sur un second appel avec le même id', () => {
    const manager = new FloatingManager();
    const menu = fakeElement('menu');
    manager.register('menu', { element: menu });
    manager.toggle('menu');
    assert.ok(manager.isOpen('menu'));
    manager.toggle('menu');
    assert.equal(manager.isOpen('menu'), false);
  });

  it("exempte le bouton qui a ouvert le panneau du clic extérieur — sinon la bascule ne fonctionne jamais", () => {
    // C'est le défaut réel corrigé en 0.15.1 : le clic sur le bouton fermait
    // *avant* de le rouvrir, si le bouton n'était pas exempté.
    const manager = new FloatingManager();
    const picker = fakeElement('picker');
    const button = fakeElement('filter-button');
    manager.register('picker', { element: picker });
    manager.open('picker', button);
    manager.handleOutsideClick('filter-button');
    assert.ok(manager.isOpen('picker'), 'le clic sur le bouton ouvreur n’aurait pas dû fermer le panneau');
  });

  it('un clic réellement extérieur ferme le panneau', () => {
    const manager = new FloatingManager();
    const picker = fakeElement('picker');
    const button = fakeElement('filter-button');
    manager.register('picker', { element: picker });
    manager.open('picker', button);
    manager.handleOutsideClick('ailleurs');
    assert.equal(manager.isOpen('picker'), false);
  });

  it('un clic dans le panneau lui-même ne le ferme pas', () => {
    const manager = new FloatingManager();
    const picker = fakeElement('picker');
    manager.register('picker', { element: picker });
    manager.open('picker');
    manager.handleOutsideClick('picker');
    assert.ok(manager.isOpen('picker'));
  });

  it("l'exception au clic extérieur ne survit pas à une fermeture", () => {
    // Sinon un bouton resterait exempté indéfiniment, y compris pour le
    // panneau suivant qu'il n'a pourtant pas ouvert.
    const manager = new FloatingManager();
    const menu = fakeElement('menu');
    const button = fakeElement('bouton');
    manager.register('menu', { element: menu });
    manager.open('menu', button);
    manager.close();
    manager.open('menu');
    manager.handleOutsideClick('bouton');
    assert.equal(manager.isOpen('menu'), false, "le bouton n'a pas ouvert ce second passage, il ne doit plus être exempté");
  });
});
