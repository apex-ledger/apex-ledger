import { Menu, type MenuItemConstructorOptions, type WebContents } from 'electron';

/** North Ledger runs without a native application menu (see menu.ts) for a cleaner, branded look.
 * The trade-off is that Electron normally wires the standard editing shortcuts (Ctrl/Cmd+C/V/X/A,
 * undo/redo) through that menu's accelerators — with no menu, Chromium does NOT copy/paste on its
 * own, so those shortcuts silently do nothing. This restores them per-webContents, plus a
 * right-click Cut/Copy/Paste/Select-All context menu, without bringing the menu bar back. */
export function installClipboardSupport(contents: WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (!(input.control || input.meta)) return;
    const key = input.key.toLowerCase();
    // Chromium's own default keyboard handling for a focused editable element ALREADY responds
    // to Ctrl/Cmd+V (and C/X/A/Z/Y) on its own — this handler existing at all doesn't stop that.
    // Without preventDefault() here, a paste fired both ways: once from contents.paste() below,
    // once from Chromium's native handling of the same keystroke never having been suppressed —
    // pasted text appeared twice in any regular input/textarea. preventDefault() makes this
    // handler's own contents.xxx() call the only thing that runs.
    if (input.shift && key === 'z') {
      event.preventDefault();
      contents.redo();
      return;
    }
    switch (key) {
      case 'c':
        event.preventDefault();
        contents.copy();
        break;
      case 'v':
        event.preventDefault();
        contents.paste();
        break;
      case 'x':
        event.preventDefault();
        contents.cut();
        break;
      case 'a':
        event.preventDefault();
        contents.selectAll();
        break;
      case 'z':
        event.preventDefault();
        contents.undo();
        break;
      case 'y':
        event.preventDefault();
        contents.redo();
        break;
      default:
        break;
    }
  });

  contents.on('context-menu', (_event, params) => {
    const hasSelection = params.selectionText.trim().length > 0;
    // accelerator + registerAccelerator:false shows the shortcut text (e.g. "Ctrl+C") next to each
    // item WITHOUT re-registering the key (before-input-event above already handles the keystroke,
    // so we don't want it firing twice).
    const template: MenuItemConstructorOptions[] = [
      { role: 'cut', accelerator: 'CommandOrControl+X', registerAccelerator: false, enabled: params.isEditable && hasSelection },
      { role: 'copy', accelerator: 'CommandOrControl+C', registerAccelerator: false, enabled: hasSelection },
      { role: 'paste', accelerator: 'CommandOrControl+V', registerAccelerator: false, enabled: params.isEditable },
      { type: 'separator' },
      { role: 'selectAll', accelerator: 'CommandOrControl+A', registerAccelerator: false },
    ];
    Menu.buildFromTemplate(template).popup();
  });
}
