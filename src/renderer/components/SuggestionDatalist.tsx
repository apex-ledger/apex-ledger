import { getSuggestions, suggestionListId } from '../utils/textSuggestions';

/** Renders the `<datalist>` an `<input list={suggestionListId(fieldKey)}>` needs to show past
 * values as a native autosuggest dropdown. One of these per field per page is enough — every input
 * of that same field kind (e.g. every line-item row in a table) can share the same `list` id. */
export function SuggestionDatalist({ fieldKey }: { fieldKey: string }) {
  const options = getSuggestions(fieldKey);
  if (options.length === 0) return null;
  return (
    <datalist id={suggestionListId(fieldKey)}>
      {options.map((opt) => (
        <option key={opt} value={opt} />
      ))}
    </datalist>
  );
}
