/** Prints a generated PDF without saving it anywhere first.
 *
 * A hidden iframe rather than window.open: a popup blocker will swallow the new window silently
 * (the user clicks Print and nothing at all happens), while an iframe is same-document and always
 * allowed. The object URL is released once the print dialog has been handed the document — not
 * immediately, or the dialog prints a blank page. */
export function printPdfFromBase64(base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  };
  document.body.appendChild(frame);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    frame.remove();
  }, 60_000);
}
