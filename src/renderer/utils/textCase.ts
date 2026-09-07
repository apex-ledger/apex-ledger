import type { FocusEvent } from 'react';
import { recordSuggestion } from './textSuggestions';

/** Capitalizes the first letter of each word without touching the rest of the word — so a name
 * typed in lowercase ("john mcdonald") becomes properly capitalized ("John Mcdonald") without
 * mangling a word that's already got internal capitals typed on purpose ("McDonald" stays
 * "McDonald", since only a lowercase first letter is ever changed). */
export function capitalizeWords(value: string): string {
  return value.replace(/(^|\s|-)([a-z])/g, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());
}

/** Attach to a text input's onBlur to apply capitalizeWords once typing is done — avoids the
 * cursor-jump/mid-word issues of capitalizing on every keystroke. */
export function capitalizeOnBlur(setter: (value: string) => void) {
  return (e: FocusEvent<HTMLInputElement>) => {
    const capitalized = capitalizeWords(e.target.value);
    if (capitalized !== e.target.value) setter(capitalized);
  };
}

/** Same as capitalizeOnBlur, plus remembers the typed value under `fieldKey` so it comes back as
 * an autosuggest option (via SuggestionDatalist) next time this kind of field is used anywhere in
 * the app. The one onBlur handler an input can have, doing both jobs. */
export function suggestOnBlur(fieldKey: string, setter: (value: string) => void) {
  return (e: FocusEvent<HTMLInputElement>) => {
    const capitalized = capitalizeWords(e.target.value);
    if (capitalized !== e.target.value) setter(capitalized);
    recordSuggestion(fieldKey, capitalized);
  };
}

/** Remembers the typed value for autosuggest WITHOUT changing its case. For memos and line
 * descriptions: a supplier's wording ("printer paper and toner", "HST return prep - Q2") is
 * evidence and should stay exactly as keyed, unlike a person's or company's name. */
export function rememberOnBlur(fieldKey: string) {
  return (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    recordSuggestion(fieldKey, e.target.value);
  };
}
