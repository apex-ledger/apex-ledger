/** Address fields as the company file keeps them; the mailing ones are optional on hand-built objects. */
export interface CompanyAddressFields {
  businessAddressLine1: string | null;
  businessAddressLine2: string | null;
  businessCity: string | null;
  businessProvince: string | null;
  businessPostalCode: string | null;
  mailingAddressLine1?: string | null;
  mailingAddressLine2?: string | null;
  mailingCity?: string | null;
  mailingProvince?: string | null;
  mailingPostalCode?: string | null;
}

function linesFrom(line1?: string | null, line2?: string | null, city?: string | null, province?: string | null, postal?: string | null): string[] {
  const lines: string[] = [];
  if (line1) lines.push([line1, line2].filter(Boolean).join(', '));
  const cityLine = [city, [province, postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  return lines;
}

/**
 * The company's address as printed on pay stubs, slips, statements and reminders: street on one line,
 * "City, PROV A1A 1A1" on the next. The business address when there is one; otherwise the mailing
 * address, so a company that only filled in where it gets mail still shows an address.
 */
export function companyAddressLines(company: CompanyAddressFields): string[] {
  const business = linesFrom(company.businessAddressLine1, company.businessAddressLine2, company.businessCity, company.businessProvince, company.businessPostalCode);
  if (business.length > 0) return business;
  return linesFrom(company.mailingAddressLine1, company.mailingAddressLine2, company.mailingCity, company.mailingProvince, company.mailingPostalCode);
}
