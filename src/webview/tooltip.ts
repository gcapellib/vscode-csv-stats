import { elements } from './dom';

export function showTooltip(event: MouseEvent, html: string): void {
  elements.tooltip.innerHTML = html;
  elements.tooltip.hidden = false;
  const bounds = elements.tooltip.getBoundingClientRect();
  const x = Math.min(event.clientX + 12, window.innerWidth - bounds.width - 8);
  const y = Math.min(event.clientY + 16, window.innerHeight - bounds.height - 8);
  elements.tooltip.style.left = `${Math.max(4, x)}px`;
  elements.tooltip.style.top = `${Math.max(4, y)}px`;
}

export function hideTooltip(): void {
  elements.tooltip.hidden = true;
}
