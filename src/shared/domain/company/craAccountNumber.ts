/** Normalizes a CRA program account for display/copying without inventing missing identifiers. */
export function normalizeCraProgramAccount(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** GST/HST accounts are a nine-digit BN followed by RT and a four-digit program reference. */
export function isValidHstProgramAccount(value: string | null | undefined): boolean {
  return /^\d{9}RT\d{4}$/.test(normalizeCraProgramAccount(value));
}

/** Prefer the dedicated GST/HST field. A general BN is accepted only when it already contains a
 * complete RT program account; a bare nine-digit BN is never silently changed to RT0001. */
export function craHstAccountNumber(hstNumber: string | null, businessNumber: string | null): string {
  const normalizedHst = normalizeCraProgramAccount(hstNumber);
  if (isValidHstProgramAccount(normalizedHst)) return normalizedHst;
  const normalizedBusiness = normalizeCraProgramAccount(businessNumber);
  return isValidHstProgramAccount(normalizedBusiness) ? normalizedBusiness : '';
}
