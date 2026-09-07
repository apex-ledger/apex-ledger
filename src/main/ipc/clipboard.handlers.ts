import { clipboard } from 'electron';

export function clipboardReadText(): string {
  return clipboard.readText();
}
