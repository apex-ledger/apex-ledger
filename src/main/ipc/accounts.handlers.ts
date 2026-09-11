import { planReclassification } from '@shared/domain/ledger/reclassifyAccount';
import type { AccountType } from '@shared/domain/types';
import { newAccountSchema, updateAccountSchema } from '@shared/validation/schemas';
import { normalBalanceForType } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts } from '../db/queries';
import { mapAccountRow } from '../db/mappers';
import { COA_TEMPLATES, getCoaTemplate, seedChartOfAccounts } from '../db/seeds/coaTemplates';
import { seedCategoryRules } from '../db/seeds/categoryRules.seed';
import { deleteCustomTemplate, getCustomTemplate, isCustomTemplateId, listCustomTemplates, saveCustomTemplate } from '../db/customCoaTemplates';
import { ensureGstHstAccountId } from '../db/buildTaxSplitLines';

export interface AccountsListFilter {
  activeOnly?: boolean;
  accountType?: string;
  search?: string;
}

export async function accountsList(filter?: AccountsListFilter) {
  const db = getCurrentDb();
  let all = await getAllAccounts(db);
  if (filter?.activeOnly) all = all.filter((a) => a.isActive);
  if (filter?.accountType) all = all.filter((a) => a.accountType === filter.accountType);
  if (filter?.search) {
    const term = filter.search.toLowerCase();
    all = all.filter((a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term));
  }
  return all;
}

export async function accountsGet(id: number) {
  const db = getCurrentDb();
  const row = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) throw new Error(`Account ${id} not found.`);
  return mapAccountRow(row);
}

/** `code` if unused, else the next unused number counting up from it. A non-numeric code that is
 * taken has no "next", so that one is still refused. */
async function nextFreeCode(db: ReturnType<typeof getCurrentDb>, code: string): Promise<string> {
  const used = new Set((await db.selectFrom('accounts').select('code').execute()).map((row) => row.code));
  if (!used.has(code)) return code;
  const numeric = Number(code);
  if (!Number.isFinite(numeric)) throw new Error(`Account code ${code} is already in use.`);
  let candidate = numeric + 1;
  while (used.has(String(candidate))) candidate += 1;
  return String(candidate);
}

/** Two active accounts of the same type with the same name is how "Visa" ends up twice in the
 * chart and a card payment lands in the wrong one. A second card goes under the first as a
 * sub-account with its own name (RBC Visa, TD Visa), never as another "Visa". Inactive accounts
 * do not count: a retired account's name may be reused. */
async function refuseDuplicateName(db: ReturnType<typeof getCurrentDb>, name: string, accountType: AccountType, exceptId: number | null): Promise<void> {
  const wanted = name.trim().toLowerCase();
  const rows = await db.selectFrom('accounts').select(['id', 'name', 'code', 'isActive']).where('accountType', '=', accountType).execute();
  const clash = rows.find((row) => row.id !== exceptId && row.isActive === 1 && row.name.trim().toLowerCase() === wanted);
  if (clash) throw new Error(`An active ${accountType.toLowerCase()} account named "${clash.name}" already exists. Open that one, or give the new account its own name — for a second card or bank account, add it as a sub-account of "${clash.name}" with the bank's name in it.`);
}

async function parentGifi(db: ReturnType<typeof getCurrentDb>, parentId: number): Promise<string | null> {
  const parent = await db.selectFrom('accounts').select('gifiCode').where('id', '=', parentId).executeTakeFirst();
  return parent?.gifiCode ?? null;
}

/** The form only offers live parents of the same type and never an account's own children, but an
 * import, the web API or a second window can send anything. A wrong parent is not cosmetic: the
 * balance sheet and roll-ups add a child into its master, so an expense under a bank account would
 * be counted as cash, and a loop would send every walk of the tree round in circles. */
async function refuseBadParent(db: ReturnType<typeof getCurrentDb>, accountId: number | null, parentId: number, accountType: string): Promise<void> {
  if (accountId !== null && parentId === accountId) throw new Error('An account cannot be its own parent.');
  const parent = await db.selectFrom('accounts').select(['id', 'name', 'accountType', 'isActive']).where('id', '=', parentId).executeTakeFirst();
  if (!parent) throw new Error(`The parent account (${parentId}) does not exist.`);
  if (parent.isActive !== 1) throw new Error(`"${parent.name}" is inactive, so nothing can be filed under it. Reactivate it first or pick another parent.`);
  if (parent.accountType !== accountType) {
    throw new Error(`A sub-account must be the same type as its parent: "${parent.name}" is ${parent.accountType.toLowerCase()}, this account is ${accountType.toLowerCase()}.`);
  }
  if (accountId === null) return;
  // Walk up from the proposed parent; meeting the account itself means it is one of its own descendants.
  const rows = await db.selectFrom('accounts').select(['id', 'parentId']).execute();
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  let cursor: number | null = parentId;
  let guard = 0;
  while (cursor != null && guard++ < 1000) {
    if (cursor === accountId) throw new Error(`That would make a loop: "${parent.name}" is already a sub-account of this account.`);
    cursor = parentOf.get(cursor) ?? null;
  }
}

/** A master with live children cannot retire: the children would roll up into nothing and the
 * chart would show them under a parent that no longer appears. Retire the children first. */
async function refuseRetiringMasterWithChildren(db: ReturnType<typeof getCurrentDb>, id: number): Promise<void> {
  const children = await db.selectFrom('accounts').select('name').where('parentId', '=', id).where('isActive', '=', 1).execute();
  if (children.length === 0) return;
  const names = children.slice(0, 3).map((c) => `"${c.name}"`).join(', ') + (children.length > 3 ? ` and ${children.length - 3} more` : '');
  throw new Error(`This account still has active sub-account${children.length === 1 ? '' : 's'} (${names}). Make them inactive, or move them elsewhere, before retiring it.`);
}

export async function accountsCreate(input: unknown) {
  const payload = newAccountSchema.parse(input);
  const db = getCurrentDb();
  // The form suggests a code from the account list it loaded when it opened. Another window, user
  // or preset can have taken that code since, and the user never sees codes, so a clash is moved
  // to the next free number rather than refused with an error nobody can act on.
  const code = await nextFreeCode(db, payload.code);
  await refuseDuplicateName(db, payload.name, payload.accountType, null);
  if (payload.parentId) await refuseBadParent(db, null, payload.parentId, payload.accountType);
  // A sub-account files under its master's GIFI line: RBC Visa and TD Visa are both "credit card
  // loans" on the T2, whatever the form or an import sent. The form says so; this makes it true.
  const gifiCode = payload.parentId ? (await parentGifi(db, payload.parentId)) ?? payload.gifiCode ?? null : payload.gifiCode ?? null;

  const inserted = await db
    .insertInto('accounts')
    .values({
      code,
      name: payload.name,
      accountType: payload.accountType,
      accountSubtype: payload.accountSubtype ?? null,
      // Always derived from accountType — never taken from the client. Every report section
      // depends on this convention being consistent, including contra accounts.
      normalBalance: normalBalanceForType(payload.accountType),
      parentId: payload.parentId ?? null,
      gifiCode,
      isActive: 1,
      isSystem: 0,
      description: payload.description ?? null,
      accountNumber: payload.accountNumber ?? null,
      isTransferEligible: payload.isTransferEligible ? 1 : 0,
      isMaster: payload.isMaster ? 1 : 0,
      currency: payload.currency ?? 'CAD',
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Choosing an existing account as a parent makes it a master automatically.
  if (payload.parentId) {
    await db.updateTable('accounts').set({ isMaster: 1 }).where('id', '=', payload.parentId).execute();
  }

  return mapAccountRow(inserted);
}

export async function accountsUpdate(input: unknown) {
  const { id, patch } = updateAccountSchema.parse(input);
  const db = getCurrentDb();

  const updateValues: Record<string, unknown> = {};
  // Codes are UNIQUE in the schema, so a clash would surface as a raw SQLite constraint error.
  // Checked here instead, to say which account already holds the code.
  if (patch.code !== undefined) {
    const clash = await db
      .selectFrom('accounts')
      .select(['id', 'name'])
      .where('code', '=', patch.code)
      .where('id', '!=', id)
      .executeTakeFirst();
    if (clash) throw new Error(`Account code ${patch.code} is already used by "${clash.name}".`);
    updateValues.code = patch.code;
  }
  if (patch.isActive !== undefined) {
    if (!patch.isActive) await refuseRetiringMasterWithChildren(db, id);
    updateValues.isActive = patch.isActive ? 1 : 0;
  }
  if (patch.name !== undefined) {
    const current = await db.selectFrom('accounts').select('accountType').where('id', '=', id).executeTakeFirst();
    if (current) await refuseDuplicateName(db, patch.name, current.accountType, id);
    updateValues.name = patch.name;
  }
  if (patch.accountSubtype !== undefined) updateValues.accountSubtype = patch.accountSubtype;
  if (patch.parentId !== undefined) {
    if (patch.parentId) {
      const current = await db.selectFrom('accounts').select('accountType').where('id', '=', id).executeTakeFirstOrThrow();
      await refuseBadParent(db, id, patch.parentId, current.accountType);
    }
    updateValues.parentId = patch.parentId;
    // Moving under a master adopts that master's GIFI, same as creating under it would.
    if (patch.parentId) {
      const inherited = await parentGifi(db, patch.parentId);
      if (inherited) updateValues.gifiCode = inherited;
    }
  }
  if (patch.gifiCode !== undefined && updateValues.gifiCode === undefined) updateValues.gifiCode = patch.gifiCode;
  if (patch.description !== undefined) updateValues.description = patch.description;
  if (patch.accountNumber !== undefined) updateValues.accountNumber = patch.accountNumber;
  if (patch.isTransferEligible !== undefined) updateValues.isTransferEligible = patch.isTransferEligible ? 1 : 0;
  if (patch.isMaster !== undefined) updateValues.isMaster = patch.isMaster ? 1 : 0;
  // accountType IS editable, but never as a plain field write: it drives normalBalance and cascades
  // to sub-accounts, so it goes through accountsReclassify below. Leaving it permanently fixed
  // meant a misfiled account — income created as an expense, say — could never be corrected at all.

  // A master's GIFI flows down: its sub-accounts are the same line on the return, so they cannot
  // drift onto a different one.
  if (updateValues.gifiCode !== undefined) {
    await db.updateTable('accounts').set({ gifiCode: updateValues.gifiCode as string | null }).where('parentId', '=', id).execute();
  }

  if (Object.keys(updateValues).length > 0) {
    await db.updateTable('accounts').set(updateValues).where('id', '=', id).execute();
  }
  return accountsGet(id);
}

/** Resolves (creating if needed) the GST/HST Payable or Recoverable account id — used by callers
 * that build their own journal lines client-side (Bank Import, Bulk Expense Import) instead of
 * going through a dedicated posting IPC handler like quickEntry.create/bills.create. */
export async function accountsEnsureGstHstAccount(direction: 'payable' | 'recoverable') {
  const db = getCurrentDb();
  const id = await ensureGstHstAccountId(db, direction);
  return { id };
}

export async function accountsDeactivate(id: number) {
  const db = getCurrentDb();
  await refuseRetiringMasterWithChildren(db, id);
  await db.updateTable('accounts').set({ isActive: 0 }).where('id', '=', id).execute();
  return accountsGet(id);
}

export async function accountsSeedFromTemplate(templateId: string) {
  const template = getCoaTemplate(templateId) ?? getCustomTemplate(templateId);
  if (!template) throw new Error(`Unknown chart of accounts template: ${templateId}`);
  const db = getCurrentDb();
  await seedChartOfAccounts(db, template);
  await seedCategoryRules(db);
  return getAllAccounts(db);
}

export async function accountsListTemplates() {
  const builtIn = COA_TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description }));
  const custom = listCustomTemplates().map((t) => ({ id: t.id, label: `${t.label} (Custom)`, description: t.description }));
  return [...builtIn, ...custom];
}

/** Saves the currently open company's whole Chart of Accounts as a reusable template, so it can
 * be loaded into future client companies in one click — the QuickBooks-style "save as template"
 * workflow. Only active accounts are captured; inactive ones aren't a useful starting point for a
 * new client. */
export async function accountsSaveAsTemplate(input: unknown) {
  const { label, description } = input as { label: string; description: string };
  if (!label?.trim()) throw new Error('Template name is required.');
  const db = getCurrentDb();
  const accounts = await getAllAccounts(db);
  const templateAccounts = accounts
    .filter((a) => a.isActive)
    .map((a) => ({ code: a.code, name: a.name, accountType: a.accountType, accountSubtype: a.accountSubtype ?? '', gifiCode: a.gifiCode }));
  if (templateAccounts.length === 0) throw new Error('This company has no accounts to save as a template.');
  const template = saveCustomTemplate(label.trim(), description?.trim() ?? '', templateAccounts);
  return { id: template.id, label: `${template.label} (Custom)`, description: template.description };
}

export async function accountsDeleteTemplate(templateId: string) {
  if (!isCustomTemplateId(templateId)) throw new Error('Built-in templates cannot be deleted.');
  deleteCustomTemplate(templateId);
  return { deleted: true as const };
}


/** What changing an account's type would do, without doing it. Feeds the confirmation dialog. */
export async function accountsReclassifyPreview(input: unknown) {
  const { id, accountType } = input as { id: number; accountType: AccountType };
  const db = getCurrentDb();
  const accounts = await getAllAccounts(db);
  const postedLineCount = await countPostedLines(db, id);
  return planReclassification(accounts, id, accountType, postedLineCount);
}

async function countPostedLines(db: ReturnType<typeof getCurrentDb>, accountId: number): Promise<number> {
  const row = await db
    .selectFrom('journalEntryLines')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('accountId', '=', accountId)
    .executeTakeFirst();
  return Number(row?.c ?? 0);
}

/**
 * Moves an account (and its sub-accounts) to a different type.
 *
 * The amounts already posted do not move — only how they are read. That is the whole point of a
 * correction, and it is why the preview states plainly what will shift before anyone confirms.
 */
export async function accountsReclassify(input: unknown) {
  const { id, accountType } = input as { id: number; accountType: AccountType };
  const db = getCurrentDb();
  const accounts = await getAllAccounts(db);
  const postedLineCount = await countPostedLines(db, id);

  const plan = planReclassification(accounts, id, accountType, postedLineCount);
  if (plan.blockedMessage) throw new Error(plan.blockedMessage);
  if (plan.changes.length === 0) return accountsGet(id);

  // One transaction: a half-moved tree would leave sub-accounts under a parent of another type,
  // which is the state the cascade exists to prevent.
  await db.transaction().execute(async (trx) => {
    for (const change of plan.changes) {
      await trx
        .updateTable('accounts')
        .set({ accountType: change.to, normalBalance: change.normalBalance })
        .where('id', '=', change.accountId)
        .execute();
    }
  });

  return accountsGet(id);
}
