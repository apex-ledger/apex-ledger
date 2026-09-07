import { useState } from 'react';
import type { Account, AccountType } from '@shared/domain/types';
import { Combobox, type ComboboxOption } from './Combobox';
import { AccountFormModal } from '../features/chart-of-accounts/AccountFormModal';

/** An account picker that can also create the account you were looking for.
 *
 * Every place that asks "which category?" eventually meets the same wall: the account doesn't
 * exist yet, and the only way to add it is to leave the half-typed invoice or bill, go to the
 * Chart of Accounts, come back, and start over. Both escape hatches live in the dropdown instead
 * — "+ New account" at the top, and a "+ sub" on each row that nests the new account under that
 * one — and the created account is selected straight away, so the interrupted work continues.
 *
 * Pages that already own an AccountFormModal for other reasons (editing an account in place, or
 * remembering which row asked) wire the same two callbacks themselves rather than using this. */
interface AccountComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** The accounts behind `options`, needed to resolve a picked row back to the parent account. */
  accounts: Account[];
  /** Type a new top-level account starts as, so it lands in the list it was created from. */
  initialType?: AccountType | null;
  /** Called with the new account: add it to the page's list, and select it if that makes sense. */
  onAccountCreated: (account: Account) => void;
  addNewLabel?: string;
}

export function AccountCombobox({
  options,
  value,
  onChange,
  placeholder,
  accounts,
  initialType,
  onAccountCreated,
  addNewLabel = '+ New account',
}: AccountComboboxProps) {
  const [createFor, setCreateFor] = useState<{ parent: Account | null } | null>(null);

  return (
    <>
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        addNewLabel={addNewLabel}
        onAddNew={() => setCreateFor({ parent: null })}
        onAddSub={(option) => setCreateFor({ parent: accounts.find((a) => a.id === Number(option.value)) ?? null })}
      />
      <AccountFormModal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        initialParent={createFor?.parent ?? null}
        initialType={initialType ?? null}
        onSaved={(created) => {
          setCreateFor(null);
          onAccountCreated(created);
        }}
      />
    </>
  );
}
