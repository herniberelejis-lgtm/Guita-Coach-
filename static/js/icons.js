/* Icon system — SVG lineales, stroke consistente (1.75px), sin emojis.
   Reemplaza el uso de emoji como iconos estructurales (anti-patrón #1 de UI
   genérica/IA). Uso: Icon('lock-open', 18) devuelve un string <svg>. */
const ICON_PATHS = {
  'lock-open': '<rect x="3.5" y="10" width="17" height="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 9.5-2.2"/>',
  'lock-closed': '<rect x="3.5" y="10" width="17" height="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
  'target': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  'sparkle': '<path d="M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9-4.9-1.6 4.9-1.6L12 3.5z"/>',
  'document': '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/>',
  'warning': '<path d="M12 4.5 21 19.5H3L12 4.5z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>',
  'info': '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/>',
  'folder': '<path d="M3.5 6.5a1 1 0 0 1 1-1H10l2 2h7.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.5z"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  'chart-bar': '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  'shield': '<path d="M12 3.5l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9v-5l7-3z"/>',
  'wallet': '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 19.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7z"/><path d="M15.5 12.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z"/>',
  'trending-up': '<path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/>',
};

function Icon(name, size = 18, extraAttrs = '') {
  const body = ICON_PATHS[name];
  if (!body) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="icon icon-${name}" ${extraAttrs}>${body}</svg>`;
}
