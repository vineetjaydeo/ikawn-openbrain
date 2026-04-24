import { useEffect } from 'react';

export interface KeyBinding {
  combo: string;
  handler: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
}

/**
 * Match a KeyboardEvent against a combo string like "mod+n", "mod+/", "escape".
 * "mod" maps to Cmd on macOS and Ctrl elsewhere.
 */
function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim());
  const expectMod = parts.includes('mod');
  const expectShift = parts.includes('shift');
  const expectAlt = parts.includes('alt');
  const key = parts[parts.length - 1] ?? '';

  const modPressed = e.metaKey || e.ctrlKey;
  if (expectMod !== modPressed) return false;
  if (expectShift !== e.shiftKey) return false;
  if (expectAlt !== e.altKey) return false;

  const eventKey = e.key.toLowerCase();
  if (key === 'enter') return eventKey === 'enter';
  if (key === 'escape' || key === 'esc') return eventKey === 'escape';
  return eventKey === key;
}

/**
 * Register global keyboard shortcuts. Bindings are re-attached when the
 * array reference changes, so wrap with useMemo in the consumer if the
 * list is static.
 *
 * Built-in shortcuts for the Design Studio:
 *   Cmd+N  -- new design
 *   Cmd+/  -- toggle sidebar
 *   Escape -- close modals / deselect
 */
export function useKeyboard(bindings: KeyBinding[]): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip when the user is typing in an input / textarea / contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable) &&
        // Allow Escape to work even inside inputs
        e.key !== 'Escape'
      ) {
        return;
      }

      for (const b of bindings) {
        if (matches(e, b.combo)) {
          if (b.preventDefault !== false) e.preventDefault();
          b.handler(e);
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings]);
}
