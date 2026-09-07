import { parseCsvRows } from '../importing/parseCsv';
import type { HomeOwnership, InsuranceProductType, TaxReturnType } from '../types';

export interface ParsedClientRow {
  clientName: string;
  dateOfBirth: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  returnType: TaxReturnType | null;
  insuranceTypes: InsuranceProductType[];
  homeOwnership: HomeOwnership | null;
}

export interface ClientImportResult {
  rows: ParsedClientRow[];
  /** 1-indexed data row numbers (header excluded) skipped for having no usable name. */
  skippedRowNumbers: number[];
}

const RETURN_TYPES: TaxReturnType[] = ['T1', 'T2', 'Both'];
const INSURANCE_TYPES: InsuranceProductType[] = ['Life', 'Critical Illness', 'Disability', 'Super Visa', 'Visitor Insurance', 'RRSP', 'TFSA', 'FHSA', 'RESP'];
const HOME_OWNERSHIP_TYPES: HomeOwnership[] = ['Own', 'Lease'];

// Maps several reasonable header spellings (including this app's own CSV export headers) onto a
// single canonical field name, so a roundtrip of the exported sheet — or a roughly-similar sheet
// from another source — both work without the user having to rename columns first.
const HEADER_ALIASES: Record<string, keyof ParsedClientRow | 'skip'> = {
  name: 'clientName',
  'client name': 'clientName',
  'full name': 'clientName',
  'date of birth': 'dateOfBirth',
  dob: 'dateOfBirth',
  phone: 'phone',
  'phone number': 'phone',
  address: 'address',
  email: 'email',
  'email id': 'email',
  'e-mail': 'email',
  service: 'returnType',
  'service (tax return type)': 'returnType',
  'return type': 'returnType',
  'tax return type': 'returnType',
  'insurance type': 'insuranceTypes',
  'insurance types': 'insuranceTypes',
  'owns home or leases': 'homeOwnership',
  'home ownership': 'homeOwnership',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function matchReturnType(value: string): TaxReturnType | null {
  const trimmed = value.trim();
  return RETURN_TYPES.find((t) => t.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

function matchInsuranceTypes(value: string): InsuranceProductType[] {
  return value
    .split(/[;,/]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => INSURANCE_TYPES.find((t) => t.toLowerCase() === v.toLowerCase()))
    .filter((t): t is InsuranceProductType => t !== undefined);
}

function matchHomeOwnership(value: string): HomeOwnership | null {
  const trimmed = value.trim();
  return HOME_OWNERSHIP_TYPES.find((t) => t.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

/** Parses a CSV export/roster of clients (Name, DOB, Phone, Address, Email, Service, Insurance
 * Type — this app's own "Export Client Sheet" format, or a close variant) back into rows ready to
 * create as client records. Rows with no usable name are skipped rather than guessed. */
export function parseClientImportCsv(csvText: string): ClientImportResult {
  const allRows = parseCsvRows(csvText);
  if (allRows.length === 0) return { rows: [], skippedRowNumbers: [] };

  const [headerRow, ...dataRows] = allRows;
  const fieldByColumn = headerRow.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? 'skip');

  const rows: ParsedClientRow[] = [];
  const skippedRowNumbers: number[] = [];

  dataRows.forEach((dataRow, i) => {
    const row: ParsedClientRow = {
      clientName: '',
      dateOfBirth: null,
      phone: null,
      address: null,
      email: null,
      returnType: null,
      insuranceTypes: [],
      homeOwnership: null,
    };
    dataRow.forEach((cell, colIndex) => {
      const field = fieldByColumn[colIndex];
      const value = cell.trim();
      if (field === 'skip' || !value) return;
      if (field === 'returnType') row.returnType = matchReturnType(value);
      else if (field === 'insuranceTypes') row.insuranceTypes = matchInsuranceTypes(value);
      else if (field === 'homeOwnership') row.homeOwnership = matchHomeOwnership(value);
      else row[field] = value;
    });
    if (!row.clientName) {
      skippedRowNumbers.push(i + 1);
      return;
    }
    rows.push(row);
  });

  return { rows, skippedRowNumbers };
}
