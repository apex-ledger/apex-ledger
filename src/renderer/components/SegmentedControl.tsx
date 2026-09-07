/**
 * A macOS/iOS segmented control: a recessed grey track with the selected segment raised as a white
 * pill. Replaces underline tabs, which are a web convention rather than an Apple one — the raised
 * pill says "this is the selected one of a fixed set" without needing a coloured rule under it.
 *
 * Used where the choice is a view of the same data (Review vs Grouping). The colour-tinted pill rows
 * elsewhere (Banking, Quick Entry) are deliberately NOT this: there the colour is carrying meaning
 * about the step, which a monochrome control would throw away.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';
  return (
    <div className="inline-flex rounded-[10px] bg-gray-500/10 p-0.5" role="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded-lg font-medium duration-250 ease-standard ${pad} ${
              selected ? 'bg-white text-gray-900 shadow-soft' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
