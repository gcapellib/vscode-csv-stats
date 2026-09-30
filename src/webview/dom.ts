/** Les références DOM de la page, prises une seule fois au chargement. */

export function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element #${id}`);
  return element;
}

export function textSpan(text: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

export const elements = {
  toolbar: byId('toolbar'),
  insightsToggle: byId('insights-toggle'),
  datasetButton: byId('dataset-button'),
  themeButton: byId('theme-button'),
  themeSwatch: byId('theme-swatch'),
  themeLabel: byId('theme-label'),
  themePopup: byId('theme-popup'),
  shape: byId('shape'),
  selection: byId('selection'),
  filterBar: byId('filters'),
  notice: byId('notice'),
  rawToggle: byId('raw-toggle'),
  rawScroller: byId('raw-scroller'),
  rawBody: byId('raw-body'),
  scroller: byId('scroller'),
  sheet: byId('sheet'),
  band: byId('band'),
  head: byId('head'),
  body: byId('body'),
  tooltip: byId('tooltip'),
  menu: byId('menu'),
  picker: byId('picker'),
};
