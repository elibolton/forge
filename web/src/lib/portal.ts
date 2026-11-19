/**
 * Moves an element to <body> so `position: fixed` is relative to the viewport.
 * Screens use transforms (`will-change`, slide animations) and some headers use
 * backdrop-filter, both of which otherwise trap fixed overlays inside them.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return { destroy() { node.remove(); } };
}
