/*
 * jsdom lacks a few DOM APIs Radix primitives call (Select opens on pointer events and scrolls the
 * selected item into view). Import this at the top of a component test that opens a Select.
 */
if (typeof window !== 'undefined') {
  const proto = window.HTMLElement.prototype as HTMLElement & Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

export {};
