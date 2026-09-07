import { useUiStore } from '../app/store/uiStore';

/**
 * An error box that knows what to do next. Most errors are just text; a locked-period or
 * filed-return refusal is different — the fix lives on another screen, so the notice offers the
 * buttons that take you there instead of leaving you to hunt for the right menu.
 */
export function ErrorNotice({ message, className = '' }: { message: string; className?: string }) {
  const setView = useUiStore((s) => s.setView);
  const filedReturn = /already been filed|has been filed|filed return|HST Centre|GST\/HST inside/i.test(message);
  const accountantLock = /is locked|locked by an accountant|locked period|period .* is locked/i.test(message) && !filedReturn;
  const anyLock = filedReturn || accountantLock;

  return (
    <div className={`rounded bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`} role="alert" data-testid={anyLock ? 'locked-period-error' : undefined}>
      <div>{message}</div>
      {anyLock && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-red-800">Where to fix it:</span>
          {filedReturn && (
            <button type="button" onClick={() => setView({ kind: 'report', report: 'hstFiling' })} className="rounded-full bg-white px-3 py-1 font-medium text-red-700 ring-1 ring-red-300 hover:bg-red-100">
              Open GST/HST Centre — void that return, then re-file after
            </button>
          )}
          {accountantLock && (
            <>
              <button type="button" onClick={() => setView({ kind: 'monthEndClose' })} className="rounded-full bg-white px-3 py-1 font-medium text-red-700 ring-1 ring-red-300 hover:bg-red-100">
                Month-End Close — see the locked period
              </button>
              <button type="button" onClick={() => setView({ kind: 'companySettings' })} className="rounded-full bg-white px-3 py-1 font-medium text-red-700 ring-1 ring-red-300 hover:bg-red-100">
                Company Settings → Fiscal periods — unlock it
              </button>
            </>
          )}
          <span className="text-red-600">Or change the entry date to an open period.</span>
        </div>
      )}
    </div>
  );
}
