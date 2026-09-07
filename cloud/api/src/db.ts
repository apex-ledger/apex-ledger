import pg from 'pg';
import type { AuthenticatedUser } from './auth.js';
import type { FirmRole } from './access.js';
import type { SubscriptionPlanCode, SubscriptionStatus } from './subscriptionEntitlements.js';
import type{BankTransferInput}from'./bankTransfer.js';
import type{ParsedBankRow}from'./bankImport.js';
import type { JournalPostInput } from './journalValidation.js';
import type { HstCode } from './hstCalculation.js';
import type { CalculatedSalesInvoice, SalesInvoiceLineInput } from './salesInvoiceCalculation.js';
import type { CustomerPaymentInput } from './customerPayment.js';
import type { InvoiceVoidInput } from './invoiceVoid.js';
import type { CalculatedVendorBill,VendorBillLineInput } from './vendorBillCalculation.js';
import type { VendorPaymentInput } from './vendorPayment.js';

const { Pool } = pg;

export interface FirmSummary {
  id: string;
  name: string;
  role: FirmRole;
  workspaceType: 'cpa_firm' | 'business';
}

export interface CompanySummary {
  id: string;
  legalName: string;
  operatingName: string | null;
  version: number;
}

export interface TenantDatabaseOptions {
  connectionString: string;
  poolMax: number;
  queryTimeoutMs: number;
}

export interface FirmMemberSummary {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: FirmRole;
  status: 'active' | 'suspended';
  companyIds:string[];
  companyNames:string[];
}

export interface FirmInvitationSummary {
  id: string;
  email: string;
  role: FirmRole;
  expiresAt: string;
  companyIds: string[];
  companyNames: string[];
}

export interface FirmSeatSummary {
  seatLimit: number;
  occupiedSeats: number;
  pendingSeats: number;
  members: FirmMemberSummary[];
  invitations: FirmInvitationSummary[];
  pendingSeatChange: SeatChangeRequestSummary | null;
}

export interface SeatChangeRequestSummary {id:string;currentSeatLimit:number;requestedSeatLimit:number;status:'pending'|'approved'|'rejected'|'canceled';createdAt:string}

export interface CreateInvitationInput {
  email: string;
  role: FirmRole;
  tokenHash: string;
  expiresAt: string;
  companyIds: string[];
}

export interface FirmSubscriptionSummary {
  planCode: SubscriptionPlanCode;
  displayName: string;
  status: SubscriptionStatus;
  hasPayrollHistory: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  version: number;
  workspaceType: 'cpa_firm' | 'business';
  role: FirmRole;
}

export type PlatformRole='platform_admin'|'customer_support';
export interface PlatformSubscriptionSummary{firmId:string;firmName:string;planCode:SubscriptionPlanCode;planName:string;status:SubscriptionStatus;seatLimit:number;currentPeriodEnd:string|null;version:string}
export interface PlatformSubscriptionChange{planCode:SubscriptionPlanCode;status:SubscriptionStatus;periodEnd:string|null;action:'renew'|'suspend'|'reactivate'|'mark_past_due'|'cancel'|'change_plan';reason:string}
export interface PlatformSubscriptionActionSummary{id:string;firmId:string;firmName:string;actorName:string;actorEmail:string;action:string;reason:string;createdAt:string}

export interface CloudAccount {
  id: string;
  name: string;
  internalCode: string | null;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  accountKind: string;
  parentAccountId: string | null;
  isMaster: boolean;
  active: boolean;
  version: number;
}

export interface CreateCloudAccountInput {
  name: string;
  internalCode?: string;
  accountType: CloudAccount['accountType'];
  accountKind: string;
  parentAccountId?: string;
  isMaster?: boolean;
}

export interface PostedJournalSummary {
  id: string;
  transactionDate: string;
  reference: string | null;
  memo: string;
  status: 'posted';
  version: number;
  debitCents: string;
  creditCents: string;
}

export interface GeneralLedgerRow {
  journalEntryId: string;
  transactionDate: string;
  reference: string | null;
  memo: string;
  lineOrder: number;
  accountId: string;
  accountName: string;
  description: string | null;
  debitCents: string;
  creditCents: string;
}

export interface BusinessTransactionInput {
  transactionType: 'sale' | 'expense';
  transactionDate: string;
  description: string;
  counterpartyName?: string;
  bankAccountId: string;
  categoryAccountId: string;
  taxCode: HstCode;
  baseCents: number;
  hstCents: number;
  totalCents: number;
}

export interface PostedBusinessTransaction {
  id: string;
  transactionType: 'sale' | 'expense';
  transactionDate: string;
  description: string;
  counterpartyName: string | null;
  taxCode: HstCode;
  baseCents: string;
  hstCents: string;
  totalCents: string;
  journalEntryId: string;
  createdAt: string;
}

export interface SalesTaxSummary {
  salesBaseCents: string;
  hstCollectedCents: string;
  expenseBaseCents: string;
  itcPaidCents: string;
  netHstPayableCents: string;
}
export interface SalesTaxCategorySummary{accountId:string;accountName:string;eventType:'sales_collected'|'itc_paid';baseCents:string;hstCents:string}

export interface CompanyContact {
  id: string;
  contactType: 'customer' | 'vendor' | 'both';
  entityType: 'business' | 'person';
  displayName: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  dateOfBirth: string | null;
  sinLastFour: string | null;
  hasSin: boolean;
  notes: string | null;
  version: number;
}

export interface CreateCompanyContactInput {
  contactType: CompanyContact['contactType'];
  entityType: CompanyContact['entityType'];
  displayName: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  dateOfBirth?: string;
  sinLookupHash?: string;
  sinLastFour?: string;
  notes?: string;
}

export interface ProductService {
  id: string; itemType: 'product' | 'service'; name: string; description: string | null; sku: string | null;
  unitPriceCents: string; revenueAccountId: string; defaultTaxCode: HstCode; active: boolean; version: number;
}

export interface CreateProductServiceInput {
  itemType: ProductService['itemType']; name: string; description?: string; sku?: string;
  unitPriceCents: number; revenueAccountId: string; defaultTaxCode: HstCode;
}
export interface UpdateProductServiceInput extends CreateProductServiceInput { expectedVersion: number }

export interface CreateSalesInvoiceInput {
  customerId: string; invoiceDate: string; dueDate: string; memo?: string;
  lines: SalesInvoiceLineInput[]; calculated: CalculatedSalesInvoice;
}

export interface SalesInvoiceSummary {
  id: string; customerId: string; customerName: string; invoiceNumber: string;
  invoiceDate: string; dueDate: string; memo: string | null;
  status: 'posted' | 'partially_paid' | 'paid' | 'voided'; subtotalCents: string;
  hstCents: string; totalCents: string; balanceCents: string; journalEntryId: string; version: number;
}
export interface SalesInvoiceLineSummary {
  id:string;lineNumber:number;productId:string|null;description:string;quantityMilli:string;unitPriceCents:string;
  revenueAccountId:string;taxCode:HstCode;baseCents:string;hstCents:string;totalCents:string;
}
export interface SalesInvoiceDetail extends SalesInvoiceSummary { lines:SalesInvoiceLineSummary[] }

export interface CustomerPaymentSummary {
  id: string; invoiceId: string; paymentDate: string; amountCents: string;
  bankAccountId: string; reference: string | null; journalEntryId: string; createdAt: string;
}
export interface CreateVendorBillInput{vendorId:string;vendorInvoiceNumber:string;billDate:string;dueDate:string;memo?:string;lines:VendorBillLineInput[];calculated:CalculatedVendorBill}
export interface VendorBillSummary{id:string;vendorId:string;vendorName:string;billNumber:string;vendorInvoiceNumber:string;billDate:string;dueDate:string;memo:string|null;
  status:'posted'|'partially_paid'|'paid'|'voided';subtotalCents:string;hstCents:string;totalCents:string;balanceCents:string;journalEntryId:string;version:number}
export interface VendorBillLineSummary{id:string;lineNumber:number;description:string;expenseAccountId:string;taxCode:HstCode;baseCents:string;hstCents:string;totalCents:string}
export interface VendorBillDetail extends VendorBillSummary{lines:VendorBillLineSummary[]}
export interface VendorPaymentSummary{id:string;billId:string;paymentDate:string;amountCents:string;bankAccountId:string;reference:string|null;journalEntryId:string;createdAt:string}
export interface BankTransferSummary{id:string;transferDate:string;fromAccountId:string;fromAccountName:string;toAccountId:string;toAccountName:string;amountCents:string;memo:string|null;journalEntryId:string;createdAt:string}
export interface BankImportSummary{id:string;accountId:string;sourceName:string;rowCount:number;importedRowCount:number;duplicateRowCount:number;createdAt:string}
export interface BankImportRowSummary{id:string;accountId:string;postedDate:string;description:string;reference:string|null;amountCents:string;status:'unmatched'|'matched'|'excluded';matchedJournalEntryId:string|null;createdAt:string}

export class TenantDatabase {
  readonly #pool: pg.Pool;

  constructor(options: TenantDatabaseOptions) {
    this.#pool = new Pool({
      connectionString: options.connectionString,
      max: options.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      query_timeout: options.queryTimeoutMs,
      application_name: 'northledger-cloud-api',
      ssl: { rejectUnauthorized: true },
    });
  }

  async ping(): Promise<void> {
    await this.#pool.query('select 1');
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async listUserFirms(user: AuthenticatedUser): Promise<FirmSummary[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      const result = await client.query<FirmSummary>(`
        select f.id, f.name, fm.role, f.workspace_type as "workspaceType"
        from firm_memberships fm
        join firms f on f.id = fm.firm_id
        where fm.user_id = $1 and fm.status = 'active' and f.status = 'active'
        order by f.name
      `, [userId]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listFirmCompanies(user: AuthenticatedUser, firmId: string): Promise<CompanySummary[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      const membership = await client.query<{ role: FirmRole }>(
        `select role from firm_memberships
         where firm_id = $1 and user_id = $2 and status = 'active'`,
        [firmId, userId],
      );
      if (!membership.rowCount) throw new TenantAccessDeniedError();

      await client.query(`select set_config('app.firm_id', $1, true)`, [firmId]);
      const result = await client.query<CompanySummary>(`
        select id, legal_name as "legalName", operating_name as "operatingName", version
        from companies
        where firm_id = $1 and archived_at is null
        order by legal_name
      `, [firmId]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listFirmSeats(user: AuthenticatedUser, firmId: string): Promise<FirmSeatSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#requireFirmAdministrator(client, firmId, userId);
      await client.query(`select set_config('app.firm_id', $1, true)`, [firmId]);

      const firm = await client.query<{ seatLimit: number }>(
        `select seat_limit as "seatLimit" from firms where id = $1 and status = 'active'`, [firmId],
      );
      const members = await client.query<FirmMemberSummary>(`
        select fm.user_id as "userId", u.display_name as "displayName", u.email,
               fm.role,fm.status,coalesce(array_agg(c.id::text order by c.legal_name)filter(where c.id is not null),'{}')as "companyIds",
               coalesce(array_agg(c.legal_name order by c.legal_name)filter(where c.id is not null),'{}')as "companyNames"
        from firm_memberships fm join app_users u on u.id=fm.user_id left join company_member_access cma on cma.firm_id=fm.firm_id and cma.user_id=fm.user_id left join companies c on c.id=cma.company_id
        where fm.firm_id = $1 and fm.status in ('active', 'suspended')
        group by fm.user_id,u.display_name,u.email,fm.role,fm.status
        order by case fm.role when 'owner' then 0 when 'firm_admin' then 1 else 2 end,
                 coalesce(u.display_name, u.email)
      `, [firmId]);
      const invitations = await client.query<FirmInvitationSummary>(`
        select fi.id,fi.email,fi.role,fi.expires_at as "expiresAt",
          coalesce(array_agg(c.id::text order by c.legal_name)filter(where c.id is not null),'{}')as "companyIds",
          coalesce(array_agg(c.legal_name order by c.legal_name)filter(where c.id is not null),'{}')as "companyNames"
        from firm_invitations fi left join firm_invitation_company_access fica on fica.invitation_id=fi.id left join companies c on c.id=fica.company_id
        where fi.firm_id=$1 and fi.accepted_at is null and fi.revoked_at is null and fi.expires_at>now()
        group by fi.id order by fi.created_at desc
      `, [firmId]);
      const seatChanges=await client.query<SeatChangeRequestSummary>(`select id,current_seat_limit as "currentSeatLimit",requested_seat_limit as "requestedSeatLimit",status,created_at as "createdAt"
        from firm_seat_change_requests where firm_id=$1 and status='pending'order by created_at desc limit 1`,[firmId]);
      const seatLimit = firm.rows[0]?.seatLimit;
      if (seatLimit === undefined) throw new TenantAccessDeniedError();
      await client.query('commit');
      return {
        seatLimit,
        occupiedSeats: members.rows.filter((member) => member.status === 'active').length,
        pendingSeats: invitations.rows.length,
        members: members.rows,
        invitations: invitations.rows,
        pendingSeatChange:seatChanges.rows[0]??null,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFirmSubscription(user: AuthenticatedUser, firmId: string): Promise<FirmSubscriptionSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      const membership = await client.query(`
        select 1 from firm_memberships
        where firm_id = $1 and user_id = $2 and status = 'active'
      `, [firmId, userId]);
      if (!membership.rowCount) throw new TenantAccessDeniedError();
      await client.query(`select set_config('app.firm_id', $1, true)`, [firmId]);
      const result = await client.query<FirmSubscriptionSummary>(`
        select fs.plan_code as "planCode", sp.display_name as "displayName", fs.status,
               fs.has_payroll_history as "hasPayrollHistory",
               fs.current_period_start as "currentPeriodStart",
               fs.current_period_end as "currentPeriodEnd", fs.version,
               f.workspace_type as "workspaceType", current_user_firm_role(fs.firm_id) as role
        from firm_subscriptions fs
        join subscription_plans sp on sp.code = fs.plan_code
        join firms f on f.id = fs.firm_id
        where fs.firm_id = $1
      `, [firmId]);
      const subscription = result.rows[0];
      if (!subscription) throw new Error('firm_subscription_missing');
      await client.query('commit');
      return subscription;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listAccounts(user: AuthenticatedUser, firmId: string, companyId: string): Promise<CloudAccount[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, false);
      const result = await client.query<CloudAccount>(`
        select id, name, internal_code as "internalCode", account_type as "accountType",
               account_kind as "accountKind", parent_account_id as "parentAccountId",
               is_master as "isMaster", active, version
        from accounts where company_id = $1 and active = true
        order by account_type, name
      `, [companyId]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async createAccount(user: AuthenticatedUser, firmId: string, companyId: string, input: CreateCloudAccountInput): Promise<CloudAccount> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, true);
      const result = await client.query<CloudAccount>(`
        insert into accounts(firm_id, company_id, name, internal_code, account_type, account_kind, parent_account_id, is_master)
        values ($1, $2, trim($3), nullif(trim($4), ''), $5, trim($6), $7, $8)
        returning id, name, internal_code as "internalCode", account_type as "accountType",
                  account_kind as "accountKind", parent_account_id as "parentAccountId",
                  is_master as "isMaster", active, version
      `, [firmId, companyId, input.name, input.internalCode ?? '', input.accountType,
        input.accountKind, input.parentAccountId ?? null, input.isMaster ?? false]);
      const account = result.rows[0];
      if (!account) throw new Error('account_create_failed');
      await client.query(`
        insert into audit_events(firm_id, company_id, actor_user_id, event_type, entity_type, entity_id, after_state)
        values ($1, $2, $3, 'account.created', 'account', $4,
          jsonb_build_object('name', $5::text, 'accountType', $6::text, 'accountKind', $7::text))
      `, [firmId, companyId, userId, account.id, account.name, account.accountType, account.accountKind]);
      await client.query('commit');
      return account;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async createAndPostJournal(
    user: AuthenticatedUser,
    firmId: string,
    companyId: string,
    idempotencyKey: string,
    requestHash: string,
    input: JournalPostInput,
  ): Promise<PostedJournalSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, true);
      await client.query(`delete from idempotency_keys where firm_id = $1 and key = $2 and expires_at <= now()`, [firmId, idempotencyKey]);
      const reservation = await client.query(`
        insert into idempotency_keys(firm_id, key, request_hash, expires_at)
        values ($1, $2, $3, now() + interval '24 hours')
        on conflict (firm_id, key) do nothing
      `, [firmId, idempotencyKey, requestHash]);
      if (!reservation.rowCount) {
        const existing = await client.query<{ requestHash: string; responseBody: PostedJournalSummary | null }>(`
          select request_hash as "requestHash", response_body as "responseBody"
          from idempotency_keys where firm_id = $1 and key = $2
        `, [firmId, idempotencyKey]);
        const previous = existing.rows[0];
        if (!previous || previous.requestHash !== requestHash) throw new IdempotencyConflictError();
        if (!previous.responseBody) throw new IdempotencyInProgressError();
        await client.query('commit');
        return previous.responseBody;
      }

      const entry = await client.query<{ id: string }>(`
        insert into journal_entries(firm_id, company_id, transaction_date, reference, memo, created_by)
        values ($1, $2, $3, nullif(trim($4), ''), trim($5), $6)
        returning id
      `, [firmId, companyId, input.transactionDate, input.reference ?? '', input.memo, userId]);
      const entryId = entry.rows[0]?.id;
      if (!entryId) throw new Error('journal_create_failed');
      for (const [lineOrder, line] of input.lines.entries()) {
        await client.query(`
          insert into journal_lines(firm_id, company_id, journal_entry_id, line_order, account_id,
                                    description, debit_cents, credit_cents, tax_code)
          values ($1, $2, $3, $4, $5, nullif(trim($6), ''), $7, $8, nullif(trim($9), ''))
        `, [firmId, companyId, entryId, lineOrder, line.accountId, line.description ?? '',
          line.debitCents, line.creditCents, line.taxCode ?? '']);
      }
      await client.query(`update journal_entries set status = 'posted' where id = $1`, [entryId]);
      const posted = await client.query<PostedJournalSummary>(`
        select je.id, je.transaction_date as "transactionDate", je.reference, je.memo, je.status,
               je.version, sum(jl.debit_cents)::text as "debitCents",
               sum(jl.credit_cents)::text as "creditCents"
        from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
        where je.id = $1
        group by je.id
      `, [entryId]);
      const response = posted.rows[0];
      if (!response) throw new Error('journal_post_failed');
      await client.query(`
        update idempotency_keys set response_status = 201, response_body = $3::jsonb
        where firm_id = $1 and key = $2
      `, [firmId, idempotencyKey, JSON.stringify(response)]);
      await client.query('commit');
      return response;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async generalLedger(
    user: AuthenticatedUser, firmId: string, companyId: string, startDate: string, endDate: string,
  ): Promise<GeneralLedgerRow[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, false, true);
      const result = await client.query<GeneralLedgerRow>(`
        select je.id as "journalEntryId", je.transaction_date as "transactionDate", je.reference,
               je.memo, jl.line_order as "lineOrder", a.id as "accountId", a.name as "accountName",
               jl.description, jl.debit_cents::text as "debitCents", jl.credit_cents::text as "creditCents"
        from journal_entries je
        join journal_lines jl on jl.journal_entry_id = je.id
        join accounts a on a.id = jl.account_id
        where je.company_id = $1 and je.status = 'posted'
          and je.transaction_date between $2 and $3
        order by je.transaction_date, je.id, jl.line_order
      `, [companyId, startDate, endDate]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async createBusinessTransaction(
    user: AuthenticatedUser,
    firmId: string,
    companyId: string,
    idempotencyKey: string,
    requestHash: string,
    input: BusinessTransactionInput,
  ): Promise<PostedBusinessTransaction> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, true, false, true);
      await client.query(`delete from idempotency_keys where firm_id = $1 and key = $2 and expires_at <= now()`, [firmId, idempotencyKey]);
      const reservation = await client.query(`
        insert into idempotency_keys(firm_id, key, request_hash, expires_at)
        values ($1, $2, $3, now() + interval '24 hours')
        on conflict (firm_id, key) do nothing
      `, [firmId, idempotencyKey, requestHash]);
      if (!reservation.rowCount) {
        const existing = await client.query<{ requestHash: string; responseBody: PostedBusinessTransaction | null }>(`
          select request_hash as "requestHash", response_body as "responseBody"
          from idempotency_keys where firm_id = $1 and key = $2
        `, [firmId, idempotencyKey]);
        const previous = existing.rows[0];
        if (!previous || previous.requestHash !== requestHash) throw new IdempotencyConflictError();
        if (!previous.responseBody) throw new IdempotencyInProgressError();
        await client.query('commit');
        return previous.responseBody;
      }

      const selectedAccounts = await client.query<{ id: string; accountType: string; accountKind: string }>(`
        select id, account_type as "accountType", account_kind as "accountKind"
        from accounts where company_id = $1 and active = true and id = any($2::uuid[])
      `, [companyId, [input.bankAccountId, input.categoryAccountId]]);
      const bank = selectedAccounts.rows.find((account) => account.id === input.bankAccountId);
      const category = selectedAccounts.rows.find((account) => account.id === input.categoryAccountId);
      if (!bank || !['bank', 'credit_card'].includes(bank.accountKind) || !category) {
        throw new BusinessTransactionAccountError();
      }
      if (input.transactionType === 'sale' && category.accountType !== 'revenue') throw new BusinessTransactionAccountError();
      if (input.transactionType === 'expense' && category.accountType !== 'expense') throw new BusinessTransactionAccountError();

      const hstKind = input.transactionType === 'sale' ? 'hst_payable' : 'hst_recoverable';
      const hstControl = input.hstCents > 0
        ? (await client.query<{ id: string }>(`
            select id from accounts where company_id = $1 and active = true and account_kind = $2
          `, [companyId, hstKind])).rows[0]?.id
        : null;
      if (input.hstCents > 0 && !hstControl) throw new BusinessTransactionAccountError();

      const entry = await client.query<{ id: string }>(`
        insert into journal_entries(firm_id, company_id, transaction_date, reference, memo, source, created_by)
        values ($1, $2, $3, null, trim($4), $5, $6) returning id
      `, [firmId, companyId, input.transactionDate, input.description, `business_${input.transactionType}`, userId]);
      const entryId = entry.rows[0]?.id;
      if (!entryId) throw new Error('journal_create_failed');

      const transaction = await client.query<PostedBusinessTransaction>(`
        insert into business_transactions(
          firm_id, company_id, transaction_type, transaction_date, description, counterparty_name,
          bank_account_id, category_account_id, tax_code, base_cents, hst_cents, journal_entry_id, created_by
        ) values ($1, $2, $3, $4, trim($5), nullif(trim($6), ''), $7, $8, $9, $10, $11, $12, $13)
        returning id, transaction_type as "transactionType", transaction_date as "transactionDate",
                  description, counterparty_name as "counterpartyName", tax_code as "taxCode",
                  base_cents::text as "baseCents", hst_cents::text as "hstCents",
                  total_cents::text as "totalCents", journal_entry_id as "journalEntryId",
                  created_at as "createdAt"
      `, [firmId, companyId, input.transactionType, input.transactionDate, input.description,
        input.counterpartyName ?? '', input.bankAccountId, input.categoryAccountId, input.taxCode,
        input.baseCents, input.hstCents, entryId, userId]);
      const response = transaction.rows[0];
      if (!response) throw new Error('business_transaction_create_failed');

      const lines = input.transactionType === 'sale'
        ? [
            { accountId: input.bankAccountId, debit: input.totalCents, credit: 0 },
            { accountId: input.categoryAccountId, debit: 0, credit: input.baseCents },
            ...(hstControl ? [{ accountId: hstControl, debit: 0, credit: input.hstCents }] : []),
          ]
        : [
            { accountId: input.categoryAccountId, debit: input.baseCents, credit: 0 },
            ...(hstControl ? [{ accountId: hstControl, debit: input.hstCents, credit: 0 }] : []),
            { accountId: input.bankAccountId, debit: 0, credit: input.totalCents },
          ];
      for (const [lineOrder, line] of lines.entries()) {
        await client.query(`
          insert into journal_lines(firm_id, company_id, journal_entry_id, line_order, account_id,
                                    description, debit_cents, credit_cents, tax_code)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [firmId, companyId, entryId, lineOrder, line.accountId, input.description,
          line.debit, line.credit, input.taxCode]);
      }
      await client.query(`update journal_entries set status = 'posted' where id = $1`, [entryId]);
      await client.query(`
        update idempotency_keys set response_status = 201, response_body = $3::jsonb
        where firm_id = $1 and key = $2
      `, [firmId, idempotencyKey, JSON.stringify(response)]);
      await client.query('commit');
      return response;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listBusinessTransactions(
    user: AuthenticatedUser, firmId: string, companyId: string, startDate: string, endDate: string,
  ): Promise<PostedBusinessTransaction[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, false);
      const result = await client.query<PostedBusinessTransaction>(`
        select id, transaction_type as "transactionType", transaction_date as "transactionDate",
               description, counterparty_name as "counterpartyName", tax_code as "taxCode",
               base_cents::text as "baseCents", hst_cents::text as "hstCents",
               total_cents::text as "totalCents", journal_entry_id as "journalEntryId",
               created_at as "createdAt"
        from business_transactions
        where company_id = $1 and transaction_date between $2 and $3
        order by transaction_date desc, created_at desc
      `, [companyId, startDate, endDate]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async salesTaxCategorySummary(user:AuthenticatedUser,firmId:string,companyId:string,startDate:string,endDate:string):Promise<SalesTaxCategorySummary[]>{
    const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
      await this.#setCompanyContext(client,firmId,companyId,userId,false);
      const result=await client.query<SalesTaxCategorySummary>(`select ste.category_account_id as "accountId",a.name as "accountName",ste.event_type as "eventType",
        sum(ste.base_cents)::text as "baseCents",sum(ste.hst_cents)::text as "hstCents" from sales_tax_events ste join accounts a on a.id=ste.category_account_id
        where ste.company_id=$1 and ste.event_date between $2 and $3 group by ste.category_account_id,a.name,ste.event_type order by ste.event_type,a.name`,[companyId,startDate,endDate]);
      await client.query('commit');return result.rows;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async salesTaxSummary(
    user: AuthenticatedUser, firmId: string, companyId: string, startDate: string, endDate: string,
  ): Promise<SalesTaxSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, false);
      const result = await client.query<SalesTaxSummary>(`
        select
          coalesce(sum(base_cents) filter (where event_type = 'sales_collected'), 0)::text as "salesBaseCents",
          coalesce(sum(hst_cents) filter (where event_type = 'sales_collected'), 0)::text as "hstCollectedCents",
          coalesce(sum(base_cents) filter (where event_type = 'itc_paid'), 0)::text as "expenseBaseCents",
          coalesce(sum(hst_cents) filter (where event_type = 'itc_paid'), 0)::text as "itcPaidCents",
          (coalesce(sum(hst_cents) filter (where event_type = 'sales_collected'), 0)
           - coalesce(sum(hst_cents) filter (where event_type = 'itc_paid'), 0))::text as "netHstPayableCents"
        from sales_tax_events
        where company_id = $1 and event_date between $2 and $3
      `, [companyId, startDate, endDate]);
      await client.query('commit');
      return result.rows[0] ?? {
        salesBaseCents: '0', hstCollectedCents: '0', expenseBaseCents: '0', itcPaidCents: '0', netHstPayableCents: '0',
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listCompanyContacts(
    user: AuthenticatedUser,
    firmId: string,
    companyId: string,
    query: string,
    contactType?: CompanyContact['contactType'],
    sinLookupHash?: string,
  ): Promise<CompanyContact[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      const role = await this.#setCompanyContext(client, firmId, companyId, userId, false);
      const canAccessProtectedIdentity = ['owner', 'firm_admin', 'accountant', 'bookkeeper'].includes(role);
      if (sinLookupHash && !canAccessProtectedIdentity) throw new TenantAccessDeniedError();
      const result = await client.query<CompanyContact>(`
        select id, contact_type as "contactType", entity_type as "entityType", display_name as "displayName",
               company_name as "companyName", first_name as "firstName", last_name as "lastName", email, phone,
               address_line1 as "addressLine1", address_line2 as "addressLine2", city, province,
               postal_code as "postalCode",
               case when $5::boolean then date_of_birth::text else null end as "dateOfBirth",
               case when $5::boolean then sin_last_four else null end as "sinLastFour",
               (sin_lookup_hash is not null) as "hasSin", notes, version
        from company_contacts
        where company_id = $1 and active = true
          and ($2 = '' or concat_ws(' ', display_name, company_name, first_name, last_name, email, phone,
               address_line1, address_line2, city, province, postal_code,
               case when $5::boolean then date_of_birth::text else null end) ilike '%' || $2 || '%')
          and ($3::text is null or contact_type = $3 or contact_type = 'both')
          and ($4::text is null or sin_lookup_hash = $4)
        order by display_name, id
        limit 200
      `, [companyId, query.trim(), contactType ?? null, sinLookupHash ?? null, canAccessProtectedIdentity]);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async createCompanyContact(
    user: AuthenticatedUser,
    firmId: string,
    companyId: string,
    input: CreateCompanyContactInput,
  ): Promise<CompanyContact> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, true, false, true);
      const result = await client.query<CompanyContact>(`
        insert into company_contacts(
          firm_id, company_id, contact_type, entity_type, display_name, company_name, first_name, last_name,
          email, phone, address_line1, address_line2, city, province, postal_code, date_of_birth,
          sin_lookup_hash, sin_last_four, notes, created_by
        ) values (
          $1, $2, $3, $4, trim($5), nullif(trim($6), ''), nullif(trim($7), ''), nullif(trim($8), ''),
          nullif(lower(trim($9)), ''), nullif(trim($10), ''), nullif(trim($11), ''), nullif(trim($12), ''),
          nullif(trim($13), ''), nullif(upper(trim($14)), ''), nullif(upper(trim($15)), ''), $16,
          $17, $18, nullif(trim($19), ''), $20
        )
        returning id, contact_type as "contactType", entity_type as "entityType", display_name as "displayName",
                  company_name as "companyName", first_name as "firstName", last_name as "lastName", email, phone,
                  address_line1 as "addressLine1", address_line2 as "addressLine2", city, province,
                  postal_code as "postalCode", date_of_birth::text as "dateOfBirth",
                  sin_last_four as "sinLastFour", (sin_lookup_hash is not null) as "hasSin", notes, version
      `, [firmId, companyId, input.contactType, input.entityType, input.displayName, input.companyName ?? '',
        input.firstName ?? '', input.lastName ?? '', input.email ?? '', input.phone ?? '', input.addressLine1 ?? '',
        input.addressLine2 ?? '', input.city ?? '', input.province ?? '', input.postalCode ?? '',
        input.dateOfBirth ?? null, input.sinLookupHash ?? null, input.sinLastFour ?? null, input.notes ?? '', userId]);
      const contact = result.rows[0];
      if (!contact) throw new Error('contact_create_failed');
      await client.query(`
        insert into audit_events(firm_id, company_id, actor_user_id, event_type, entity_type, entity_id, after_state)
        values ($1, $2, $3, 'contact.created', 'company_contact', $4,
          jsonb_build_object('displayName', $5::text, 'contactType', $6::text, 'hasSin', $7::boolean))
      `, [firmId, companyId, userId, contact.id, contact.displayName, contact.contactType, contact.hasSin]);
      await client.query('commit');
      return contact;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listProductsServices(user: AuthenticatedUser, firmId: string, companyId: string): Promise<ProductService[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, false);
      const result = await client.query<ProductService>(`
        select id, item_type as "itemType", name, description, sku, unit_price_cents::text as "unitPriceCents",
               revenue_account_id as "revenueAccountId", default_tax_code as "defaultTaxCode", active, version
        from products_services where company_id = $1 and active = true order by name, id
      `, [companyId]);
      await client.query('commit'); return result.rows;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async createProductService(
    user: AuthenticatedUser, firmId: string, companyId: string, input: CreateProductServiceInput,
  ): Promise<ProductService> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, true);
      const revenue = await client.query(`select 1 from accounts where company_id = $1 and id = $2 and active = true and account_type = 'revenue'`, [companyId, input.revenueAccountId]);
      if (!revenue.rowCount) throw new SalesInvoiceAccountError();
      const result = await client.query<ProductService>(`
        insert into products_services(firm_id, company_id, item_type, name, description, sku, unit_price_cents,
                                      revenue_account_id, default_tax_code, created_by)
        values ($1, $2, $3, trim($4), nullif(trim($5), ''), nullif(trim($6), ''), $7, $8, $9, $10)
        returning id, item_type as "itemType", name, description, sku, unit_price_cents::text as "unitPriceCents",
                  revenue_account_id as "revenueAccountId", default_tax_code as "defaultTaxCode", active, version
      `, [firmId, companyId, input.itemType, input.name, input.description ?? '', input.sku ?? '',
        input.unitPriceCents, input.revenueAccountId, input.defaultTaxCode, userId]);
      const product = result.rows[0]; if (!product) throw new Error('product_create_failed');
      await client.query(`insert into audit_events(firm_id, company_id, actor_user_id, event_type, entity_type, entity_id, after_state)
        values ($1,$2,$3,'product.created','product_service',$4,jsonb_build_object('name',$5::text,'itemType',$6::text))`,
      [firmId, companyId, userId, product.id, product.name, product.itemType]);
      await client.query('commit'); return product;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async updateProductService(
    user:AuthenticatedUser,firmId:string,companyId:string,productId:string,input:UpdateProductServiceInput,
  ):Promise<ProductService>{
    const client=await this.#pool.connect();
    try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
      await this.#setCompanyContext(client,firmId,companyId,userId,true);
      const revenue=await client.query(`select 1 from accounts where company_id=$1 and id=$2 and active=true and account_type='revenue'`,[companyId,input.revenueAccountId]);
      if(!revenue.rowCount)throw new SalesInvoiceAccountError();
      const before=await client.query<ProductService>(`select id,item_type as "itemType",name,description,sku,unit_price_cents::text as "unitPriceCents",
        revenue_account_id as "revenueAccountId",default_tax_code as "defaultTaxCode",active,version from products_services where company_id=$1 and id=$2 and active=true for update`,[companyId,productId]);
      const previous=before.rows[0];if(!previous||previous.version!==input.expectedVersion)throw new ProductVersionConflictError();
      const updated=await client.query<ProductService>(`update products_services set item_type=$3,name=trim($4),description=nullif(trim($5),''),sku=nullif(trim($6),''),
        unit_price_cents=$7,revenue_account_id=$8,default_tax_code=$9 where company_id=$1 and id=$2
        returning id,item_type as "itemType",name,description,sku,unit_price_cents::text as "unitPriceCents",revenue_account_id as "revenueAccountId",
          default_tax_code as "defaultTaxCode",active,version`,[companyId,productId,input.itemType,input.name,input.description??'',input.sku??'',input.unitPriceCents,input.revenueAccountId,input.defaultTaxCode]);
      const product=updated.rows[0];if(!product)throw new ProductVersionConflictError();
      await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,before_state,after_state)
        values($1,$2,$3,'product.updated','product_service',$4,$5::jsonb,$6::jsonb)`,[firmId,companyId,userId,product.id,JSON.stringify(previous),JSON.stringify(product)]);
      await client.query('commit');return product;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async createSalesInvoice(
    user: AuthenticatedUser, firmId: string, companyId: string, idempotencyKey: string,
    requestHash: string, input: CreateSalesInvoiceInput,
  ): Promise<SalesInvoiceSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, true);
      await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`, [firmId, idempotencyKey]);
      const reservation = await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at)
        values($1,$2,$3,now()+interval '24 hours') on conflict(firm_id,key) do nothing`, [firmId, idempotencyKey, requestHash]);
      if (!reservation.rowCount) {
        const existing = await client.query<{ requestHash: string; responseBody: SalesInvoiceSummary | null }>(`
          select request_hash as "requestHash", response_body as "responseBody" from idempotency_keys where firm_id=$1 and key=$2`, [firmId, idempotencyKey]);
        const previous = existing.rows[0];
        if (!previous || previous.requestHash !== requestHash) throw new IdempotencyConflictError();
        if (!previous.responseBody) throw new IdempotencyInProgressError();
        await client.query('commit'); return previous.responseBody;
      }
      const customer = await client.query<{displayName:string}>(`select display_name as "displayName" from company_contacts where company_id=$1 and id=$2 and active=true and contact_type in ('customer','both')`, [companyId, input.customerId]);
      if (!customer.rowCount) throw new SalesInvoiceCustomerError();
      const accountIds = [...new Set(input.calculated.lines.map((line) => line.revenueAccountId))];
      const revenueAccounts = await client.query<{ id: string }>(`select id from accounts where company_id=$1 and active=true and account_type='revenue' and id=any($2::uuid[])`, [companyId, accountIds]);
      if (revenueAccounts.rowCount !== accountIds.length) throw new SalesInvoiceAccountError();
      const productIds = [...new Set(input.calculated.lines.map((line) => line.productId).filter((id): id is string => Boolean(id)))];
      if (productIds.length) {
        const products = await client.query(`select id from products_services where company_id=$1 and active=true and id=any($2::uuid[])`, [companyId, productIds]);
        if (products.rowCount !== productIds.length) throw new SalesInvoiceProductError();
      }
      const controls = await client.query<{ id: string; accountKind: string }>(`
        select id, account_kind as "accountKind" from accounts where company_id=$1 and active=true
          and account_kind=any($2::text[])`, [companyId, input.calculated.hstCents > 0 ? ['accounts_receivable','hst_payable'] : ['accounts_receivable']]);
      const arId = controls.rows.find((row) => row.accountKind === 'accounts_receivable')?.id;
      const hstId = controls.rows.find((row) => row.accountKind === 'hst_payable')?.id;
      if (!arId || (input.calculated.hstCents > 0 && !hstId)) throw new SalesInvoiceAccountError();
      await client.query(`insert into company_document_sequences(firm_id,company_id,document_type,next_number)
        values($1,$2,'invoice',1) on conflict(company_id,document_type) do nothing`, [firmId, companyId]);
      const sequence = await client.query<{ invoiceNumber: string }>(`update company_document_sequences set next_number=next_number+1
        where company_id=$1 and document_type='invoice' returning (next_number-1)::text as "invoiceNumber"`, [companyId]);
      const invoiceNumber = sequence.rows[0]?.invoiceNumber; if (!invoiceNumber) throw new Error('invoice_sequence_failed');
      const entry = await client.query<{ id: string }>(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values($1,$2,$3,$4,$5,'sales_invoice',$6) returning id`, [firmId, companyId, input.invoiceDate, `INV-${invoiceNumber}`, input.memo?.trim() || `Invoice ${invoiceNumber}`, userId]);
      const journalEntryId = entry.rows[0]?.id; if (!journalEntryId) throw new Error('journal_create_failed');
      const inserted = await client.query<SalesInvoiceSummary>(`insert into sales_invoices(firm_id,company_id,customer_id,invoice_number,invoice_date,due_date,memo,
        subtotal_cents,hst_cents,balance_cents,journal_entry_id,created_by)
        values($1,$2,$3,$4,$5,$6,nullif(trim($7),''),$8,$9,$10,$11,$12)
        returning id, customer_id as "customerId", ''::text as "customerName", invoice_number::text as "invoiceNumber",
          invoice_date::text as "invoiceDate",due_date::text as "dueDate",memo,status,subtotal_cents::text as "subtotalCents",
          hst_cents::text as "hstCents",total_cents::text as "totalCents",balance_cents::text as "balanceCents",
          journal_entry_id as "journalEntryId",version`, [firmId, companyId, input.customerId, invoiceNumber, input.invoiceDate,
        input.dueDate, input.memo ?? '', input.calculated.subtotalCents, input.calculated.hstCents, input.calculated.totalCents, journalEntryId, userId]);
      const response = inserted.rows[0]; if (!response) throw new Error('invoice_create_failed');
      response.customerName = customer.rows[0]?.displayName ?? '';
      for (const line of input.calculated.lines) await client.query(`insert into sales_invoice_lines(firm_id,company_id,invoice_id,line_number,product_id,description,
        quantity_milli,unit_price_cents,revenue_account_id,tax_code,base_cents,hst_cents)
        values($1,$2,$3,$4,$5,trim($6),$7,$8,$9,$10,$11,$12)`, [firmId, companyId, response.id, line.lineNumber,
        line.productId ?? null, line.description, line.quantityMilli, line.unitPriceCents, line.revenueAccountId, line.taxCode, line.baseCents, line.hstCents]);
      let lineOrder = 0;
      await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents)
        values($1,$2,$3,$4,$5,$6,$7,0)`, [firmId, companyId, journalEntryId, lineOrder++, arId, `Invoice ${invoiceNumber}`, input.calculated.totalCents]);
      for (const line of input.calculated.lines) await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code)
        values($1,$2,$3,$4,$5,$6,0,$7,$8)`, [firmId, companyId, journalEntryId, lineOrder++, line.revenueAccountId, line.description, line.baseCents, line.taxCode]);
      if (hstId && input.calculated.hstCents > 0) await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code)
        values($1,$2,$3,$4,$5,'HST collected',0,$6,'hst_13')`, [firmId, companyId, journalEntryId, lineOrder, hstId, input.calculated.hstCents]);
      await client.query(`update journal_entries set status='posted' where id=$1`, [journalEntryId]);
      await client.query(`update idempotency_keys set response_status=201,response_body=$3::jsonb where firm_id=$1 and key=$2`, [firmId, idempotencyKey, JSON.stringify(response)]);
      await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state)
        values($1,$2,$3,'invoice.posted','sales_invoice',$4,jsonb_build_object('invoiceNumber',$5::text,'totalCents',$6::bigint))`,
      [firmId, companyId, userId, response.id, invoiceNumber, input.calculated.totalCents]);
      await client.query('commit'); return response;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async listSalesInvoices(user: AuthenticatedUser, firmId: string, companyId: string): Promise<SalesInvoiceSummary[]> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin'); const userId = await this.#upsertUser(client, user); await this.#setUserContext(client, userId);
      await this.#setCompanyContext(client, firmId, companyId, userId, false, true);
      const result = await client.query<SalesInvoiceSummary>(`select si.id,si.customer_id as "customerId",cc.display_name as "customerName",
        si.invoice_number::text as "invoiceNumber",si.invoice_date::text as "invoiceDate",si.due_date::text as "dueDate",si.memo,si.status,
        si.subtotal_cents::text as "subtotalCents",si.hst_cents::text as "hstCents",si.total_cents::text as "totalCents",
        si.balance_cents::text as "balanceCents",si.journal_entry_id as "journalEntryId",si.version
        from sales_invoices si join company_contacts cc on cc.id=si.customer_id where si.company_id=$1 order by si.invoice_date desc,si.invoice_number desc limit 500`, [companyId]);
      await client.query('commit'); return result.rows;
    } catch(error){ await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async getSalesInvoice(user:AuthenticatedUser,firmId:string,companyId:string,invoiceId:string):Promise<SalesInvoiceDetail>{
    const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
      await this.#setCompanyContext(client,firmId,companyId,userId,false,true);
      const invoices=await client.query<SalesInvoiceSummary>(`select si.id,si.customer_id as "customerId",cc.display_name as "customerName",si.invoice_number::text as "invoiceNumber",
        si.invoice_date::text as "invoiceDate",si.due_date::text as "dueDate",si.memo,si.status,si.subtotal_cents::text as "subtotalCents",si.hst_cents::text as "hstCents",
        si.total_cents::text as "totalCents",si.balance_cents::text as "balanceCents",si.journal_entry_id as "journalEntryId",si.version
        from sales_invoices si join company_contacts cc on cc.id=si.customer_id where si.company_id=$1 and si.id=$2`,[companyId,invoiceId]);
      const invoice=invoices.rows[0];if(!invoice)throw new SalesInvoiceNotFoundError();
      const lines=await client.query<SalesInvoiceLineSummary>(`select id,line_number as "lineNumber",product_id as "productId",description,quantity_milli::text as "quantityMilli",
        unit_price_cents::text as "unitPriceCents",revenue_account_id as "revenueAccountId",tax_code as "taxCode",base_cents::text as "baseCents",
        hst_cents::text as "hstCents",total_cents::text as "totalCents" from sales_invoice_lines where company_id=$1 and invoice_id=$2 order by line_number`,[companyId,invoiceId]);
      await client.query('commit');return{...invoice,lines:lines.rows};
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async voidSalesInvoice(user:AuthenticatedUser,firmId:string,companyId:string,invoiceId:string,idempotencyKey:string,requestHash:string,input:InvoiceVoidInput):Promise<SalesInvoiceSummary>{
    const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
      await this.#setCompanyContext(client,firmId,companyId,userId,true);
      await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`,[firmId,idempotencyKey]);
      const reservation=await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at) values($1,$2,$3,now()+interval '24 hours') on conflict(firm_id,key) do nothing`,[firmId,idempotencyKey,requestHash]);
      if(!reservation.rowCount){const existing=await client.query<{requestHash:string;responseBody:SalesInvoiceSummary|null}>(`select request_hash as "requestHash",response_body as "responseBody" from idempotency_keys where firm_id=$1 and key=$2`,[firmId,idempotencyKey]);
        const previous=existing.rows[0];if(!previous||previous.requestHash!==requestHash)throw new IdempotencyConflictError();if(!previous.responseBody)throw new IdempotencyInProgressError();await client.query('commit');return previous.responseBody;}
      const invoiceRows=await client.query<{invoiceNumber:string;invoiceDate:string;status:string;totalCents:string;balanceCents:string;journalEntryId:string}>(`select invoice_number::text as "invoiceNumber",invoice_date::text as "invoiceDate",status,total_cents::text as "totalCents",
        balance_cents::text as "balanceCents",journal_entry_id as "journalEntryId" from sales_invoices where company_id=$1 and id=$2 for update`,[companyId,invoiceId]);
      const invoice=invoiceRows.rows[0];if(!invoice||invoice.status!=='posted'||invoice.balanceCents!==invoice.totalCents||input.voidDate<invoice.invoiceDate)throw new InvoiceVoidConflictError();
      const originalLines=await client.query<{lineOrder:number;accountId:string;description:string|null;debitCents:string;creditCents:string;taxCode:string|null}>(`select line_order as "lineOrder",account_id as "accountId",description,
        debit_cents::text as "debitCents",credit_cents::text as "creditCents",tax_code as "taxCode" from journal_lines where journal_entry_id=$1 order by line_order`,[invoice.journalEntryId]);
      const reversal=await client.query<{id:string}>(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values($1,$2,$3,$4,$5,'sales_invoice_void',$6) returning id`,[firmId,companyId,input.voidDate,`VOID-INV-${invoice.invoiceNumber}`,input.reason.trim(),userId]);
      const reversalId=reversal.rows[0]?.id;if(!reversalId)throw new Error('invoice_void_journal_failed');
      for(const line of originalLines.rows)await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[firmId,companyId,reversalId,line.lineOrder,line.accountId,line.description,line.creditCents,line.debitCents,line.taxCode]);
      await client.query(`update journal_entries set status='posted' where id=$1`,[reversalId]);
      await client.query(`update sales_invoices set status='voided',balance_cents=0,void_journal_entry_id=$2,voided_at=now(),voided_by=$3,void_reason=$4 where id=$1`,[invoiceId,reversalId,userId,input.reason.trim()]);
      const result=await client.query<SalesInvoiceSummary>(`select si.id,si.customer_id as "customerId",cc.display_name as "customerName",si.invoice_number::text as "invoiceNumber",
        si.invoice_date::text as "invoiceDate",si.due_date::text as "dueDate",si.memo,si.status,si.subtotal_cents::text as "subtotalCents",si.hst_cents::text as "hstCents",
        si.total_cents::text as "totalCents",si.balance_cents::text as "balanceCents",si.journal_entry_id as "journalEntryId",si.version
        from sales_invoices si join company_contacts cc on cc.id=si.customer_id where si.id=$1`,[invoiceId]);
      const response=result.rows[0];if(!response)throw new Error('invoice_void_failed');
      await client.query(`update idempotency_keys set response_status=200,response_body=$3::jsonb where firm_id=$1 and key=$2`,[firmId,idempotencyKey,JSON.stringify(response)]);
      await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state) values
        ($1,$2,$3,'invoice.voided','sales_invoice',$4,jsonb_build_object('invoiceNumber',$5::text,'reversalJournalId',$6::text,'reason',$7::text))`,[firmId,companyId,userId,invoiceId,invoice.invoiceNumber,reversalId,input.reason.trim()]);
      await client.query('commit');return response;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async createCustomerPayment(
    user: AuthenticatedUser, firmId: string, companyId: string, invoiceId: string,
    idempotencyKey: string, requestHash: string, input: CustomerPaymentInput,
  ): Promise<CustomerPaymentSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin'); const userId=await this.#upsertUser(client,user); await this.#setUserContext(client,userId);
      await this.#setCompanyContext(client,firmId,companyId,userId,true);
      await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`,[firmId,idempotencyKey]);
      const reservation=await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at) values($1,$2,$3,now()+interval '24 hours')
        on conflict(firm_id,key) do nothing`,[firmId,idempotencyKey,requestHash]);
      if(!reservation.rowCount){
        const existing=await client.query<{requestHash:string;responseBody:CustomerPaymentSummary|null}>(`select request_hash as "requestHash",response_body as "responseBody"
          from idempotency_keys where firm_id=$1 and key=$2`,[firmId,idempotencyKey]); const previous=existing.rows[0];
        if(!previous||previous.requestHash!==requestHash)throw new IdempotencyConflictError(); if(!previous.responseBody)throw new IdempotencyInProgressError();
        await client.query('commit'); return previous.responseBody;
      }
      const invoices=await client.query<{invoiceNumber:string;invoiceDate:string;balanceCents:string;status:string}>(`select invoice_number::text as "invoiceNumber",
        invoice_date::text as "invoiceDate",balance_cents::text as "balanceCents",status from sales_invoices where company_id=$1 and id=$2 for update`,[companyId,invoiceId]);
      const invoice=invoices.rows[0];
      if(!invoice||invoice.status==='voided'||invoice.status==='paid'||input.amountCents>Number(invoice.balanceCents)||input.paymentDate<invoice.invoiceDate){
        throw new CustomerPaymentAllocationError();
      }
      const accounts=await client.query<{id:string;accountKind:string}>(`select id,account_kind as "accountKind" from accounts where company_id=$1 and active=true
        and (id=$2 or account_kind='accounts_receivable')`,[companyId,input.bankAccountId]);
      const bank=accounts.rows.find((row)=>row.id===input.bankAccountId); const arId=accounts.rows.find((row)=>row.accountKind==='accounts_receivable')?.id;
      if(!bank||bank.accountKind!=='bank'||!arId)throw new SalesInvoiceAccountError();
      const entry=await client.query<{id:string}>(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values($1,$2,$3,nullif(trim($4),''),$5,'customer_payment',$6) returning id`,[firmId,companyId,input.paymentDate,input.reference??'',`Payment for invoice ${invoice.invoiceNumber}`,userId]);
      const journalEntryId=entry.rows[0]?.id;if(!journalEntryId)throw new Error('journal_create_failed');
      const paymentResult=await client.query<CustomerPaymentSummary>(`insert into customer_payments(firm_id,company_id,invoice_id,payment_date,amount_cents,bank_account_id,reference,journal_entry_id,created_by)
        values($1,$2,$3,$4,$5,$6,nullif(trim($7),''),$8,$9) returning id,invoice_id as "invoiceId",payment_date::text as "paymentDate",amount_cents::text as "amountCents",
        bank_account_id as "bankAccountId",reference,journal_entry_id as "journalEntryId",created_at as "createdAt"`,[firmId,companyId,invoiceId,input.paymentDate,input.amountCents,input.bankAccountId,input.reference??'',journalEntryId,userId]);
      const payment=paymentResult.rows[0];if(!payment)throw new Error('payment_create_failed');
      await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents) values
        ($1,$2,$3,0,$4,$5,$6,0),($1,$2,$3,1,$7,$5,0,$6)`,[firmId,companyId,journalEntryId,input.bankAccountId,`Payment for invoice ${invoice.invoiceNumber}`,input.amountCents,arId]);
      await client.query(`update journal_entries set status='posted' where id=$1`,[journalEntryId]);
      await client.query(`update sales_invoices set balance_cents=balance_cents-$2,status=case when balance_cents-$2=0 then 'paid' else 'partially_paid' end where id=$1`,[invoiceId,input.amountCents]);
      await client.query(`update idempotency_keys set response_status=201,response_body=$3::jsonb where firm_id=$1 and key=$2`,[firmId,idempotencyKey,JSON.stringify(payment)]);
      await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state) values
        ($1,$2,$3,'customer.payment.posted','customer_payment',$4,jsonb_build_object('invoiceId',$5::text,'amountCents',$6::bigint))`,[firmId,companyId,userId,payment.id,invoiceId,input.amountCents]);
      await client.query('commit');return payment;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async createVendorBill(user:AuthenticatedUser,firmId:string,companyId:string,idempotencyKey:string,requestHash:string,input:CreateVendorBillInput):Promise<VendorBillSummary>{
    const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
      await this.#setCompanyContext(client,firmId,companyId,userId,true);
      await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`,[firmId,idempotencyKey]);
      const reservation=await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at)values($1,$2,$3,now()+interval'24 hours')on conflict(firm_id,key)do nothing`,[firmId,idempotencyKey,requestHash]);
      if(!reservation.rowCount){const existing=await client.query<{requestHash:string;responseBody:VendorBillSummary|null}>(`select request_hash as "requestHash",response_body as "responseBody"from idempotency_keys where firm_id=$1 and key=$2`,[firmId,idempotencyKey]);
        const previous=existing.rows[0];if(!previous||previous.requestHash!==requestHash)throw new IdempotencyConflictError();if(!previous.responseBody)throw new IdempotencyInProgressError();await client.query('commit');return previous.responseBody;}
      const vendor=await client.query<{displayName:string}>(`select display_name as "displayName"from company_contacts where company_id=$1 and id=$2 and active=true and contact_type in('vendor','both')`,[companyId,input.vendorId]);
      if(!vendor.rowCount)throw new VendorBillVendorError();
      const expenseIds=[...new Set(input.calculated.lines.map((line)=>line.expenseAccountId))];const expenses=await client.query(`select id from accounts where company_id=$1 and active=true and account_type='expense'and id=any($2::uuid[])`,[companyId,expenseIds]);
      if(expenses.rowCount!==expenseIds.length)throw new VendorBillAccountError();
      const controls=await client.query<{id:string;accountKind:string}>(`select id,account_kind as "accountKind"from accounts where company_id=$1 and active=true and account_kind=any($2::text[])`,[companyId,input.calculated.hstCents>0?['accounts_payable','hst_recoverable']:['accounts_payable']]);
      const apId=controls.rows.find((row)=>row.accountKind==='accounts_payable')?.id;const hstId=controls.rows.find((row)=>row.accountKind==='hst_recoverable')?.id;
      if(!apId||(input.calculated.hstCents>0&&!hstId))throw new VendorBillAccountError();
      await client.query(`insert into company_document_sequences(firm_id,company_id,document_type,next_number)values($1,$2,'bill',1)on conflict(company_id,document_type)do nothing`,[firmId,companyId]);
      const sequence=await client.query<{billNumber:string}>(`update company_document_sequences set next_number=next_number+1 where company_id=$1 and document_type='bill'returning(next_number-1)::text as "billNumber"`,[companyId]);
      const billNumber=sequence.rows[0]?.billNumber;if(!billNumber)throw new Error('bill_sequence_failed');
      const entry=await client.query<{id:string}>(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)values($1,$2,$3,$4,$5,'vendor_bill',$6)returning id`,
        [firmId,companyId,input.billDate,`BILL-${billNumber}`,input.memo?.trim()||`Vendor bill ${input.vendorInvoiceNumber.trim()}`,userId]);const journalEntryId=entry.rows[0]?.id;if(!journalEntryId)throw new Error('journal_create_failed');
      const inserted=await client.query<VendorBillSummary>(`insert into vendor_bills(firm_id,company_id,vendor_id,bill_number,vendor_invoice_number,bill_date,due_date,memo,subtotal_cents,hst_cents,balance_cents,journal_entry_id,created_by)
        values($1,$2,$3,$4,upper(trim($5)),$6,$7,nullif(trim($8),''),$9,$10,$11,$12,$13)returning id,vendor_id as "vendorId",''::text as "vendorName",bill_number::text as "billNumber",
        vendor_invoice_number as "vendorInvoiceNumber",bill_date::text as "billDate",due_date::text as "dueDate",memo,status,subtotal_cents::text as "subtotalCents",hst_cents::text as "hstCents",total_cents::text as "totalCents",
        balance_cents::text as "balanceCents",journal_entry_id as "journalEntryId",version`,[firmId,companyId,input.vendorId,billNumber,input.vendorInvoiceNumber,input.billDate,input.dueDate,input.memo??'',input.calculated.subtotalCents,input.calculated.hstCents,input.calculated.totalCents,journalEntryId,userId]);
      const response=inserted.rows[0];if(!response)throw new Error('bill_create_failed');response.vendorName=vendor.rows[0]?.displayName??'';
      for(const line of input.calculated.lines)await client.query(`insert into vendor_bill_lines(firm_id,company_id,bill_id,line_number,description,expense_account_id,tax_code,base_cents,hst_cents)
        values($1,$2,$3,$4,trim($5),$6,$7,$8,$9)`,[firmId,companyId,response.id,line.lineNumber,line.description,line.expenseAccountId,line.taxCode,line.baseCents,line.hstCents]);
      let lineOrder=0;for(const line of input.calculated.lines)await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code)
        values($1,$2,$3,$4,$5,$6,$7,0,$8)`,[firmId,companyId,journalEntryId,lineOrder++,line.expenseAccountId,line.description,line.baseCents,line.taxCode]);
      if(hstId&&input.calculated.hstCents>0)await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code)
        values($1,$2,$3,$4,$5,'HST recoverable',$6,0,'hst_13')`,[firmId,companyId,journalEntryId,lineOrder++,hstId,input.calculated.hstCents]);
      await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents)values($1,$2,$3,$4,$5,$6,0,$7)`,
        [firmId,companyId,journalEntryId,lineOrder,apId,`Vendor bill ${input.vendorInvoiceNumber.trim()}`,input.calculated.totalCents]);
      await client.query(`update journal_entries set status='posted'where id=$1`,[journalEntryId]);
      await client.query(`update idempotency_keys set response_status=201,response_body=$3::jsonb where firm_id=$1 and key=$2`,[firmId,idempotencyKey,JSON.stringify(response)]);
      await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state)values($1,$2,$3,'bill.posted','vendor_bill',$4,
        jsonb_build_object('billNumber',$5::text,'vendorInvoiceNumber',$6::text,'totalCents',$7::bigint))`,[firmId,companyId,userId,response.id,billNumber,response.vendorInvoiceNumber,input.calculated.totalCents]);
      await client.query('commit');return response;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async listVendorBills(user:AuthenticatedUser,firmId:string,companyId:string):Promise<VendorBillSummary[]>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    await this.#setCompanyContext(client,firmId,companyId,userId,false,true);const result=await client.query<VendorBillSummary>(`select vb.id,vb.vendor_id as "vendorId",cc.display_name as "vendorName",vb.bill_number::text as "billNumber",
      vb.vendor_invoice_number as "vendorInvoiceNumber",vb.bill_date::text as "billDate",vb.due_date::text as "dueDate",vb.memo,vb.status,vb.subtotal_cents::text as "subtotalCents",vb.hst_cents::text as "hstCents",
      vb.total_cents::text as "totalCents",vb.balance_cents::text as "balanceCents",vb.journal_entry_id as "journalEntryId",vb.version from vendor_bills vb join company_contacts cc on cc.id=vb.vendor_id
      where vb.company_id=$1 order by vb.bill_date desc,vb.bill_number desc limit 500`,[companyId]);await client.query('commit');return result.rows;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async getVendorBill(user:AuthenticatedUser,firmId:string,companyId:string,billId:string):Promise<VendorBillDetail>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    await this.#setCompanyContext(client,firmId,companyId,userId,false,true);const bills=await client.query<VendorBillSummary>(`select vb.id,vb.vendor_id as "vendorId",cc.display_name as "vendorName",vb.bill_number::text as "billNumber",vb.vendor_invoice_number as "vendorInvoiceNumber",
      vb.bill_date::text as "billDate",vb.due_date::text as "dueDate",vb.memo,vb.status,vb.subtotal_cents::text as "subtotalCents",vb.hst_cents::text as "hstCents",vb.total_cents::text as "totalCents",
      vb.balance_cents::text as "balanceCents",vb.journal_entry_id as "journalEntryId",vb.version from vendor_bills vb join company_contacts cc on cc.id=vb.vendor_id where vb.company_id=$1 and vb.id=$2`,[companyId,billId]);
    const bill=bills.rows[0];if(!bill)throw new VendorBillNotFoundError();const lines=await client.query<VendorBillLineSummary>(`select id,line_number as "lineNumber",description,expense_account_id as "expenseAccountId",tax_code as "taxCode",
      base_cents::text as "baseCents",hst_cents::text as "hstCents",total_cents::text as "totalCents"from vendor_bill_lines where company_id=$1 and bill_id=$2 order by line_number`,[companyId,billId]);
    await client.query('commit');return{...bill,lines:lines.rows};}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async createVendorPayment(user:AuthenticatedUser,firmId:string,companyId:string,billId:string,idempotencyKey:string,requestHash:string,input:VendorPaymentInput):Promise<VendorPaymentSummary>{
    const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);await this.#setCompanyContext(client,firmId,companyId,userId,true);
      await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`,[firmId,idempotencyKey]);const reservation=await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at)values($1,$2,$3,now()+interval'24 hours')on conflict(firm_id,key)do nothing`,[firmId,idempotencyKey,requestHash]);
      if(!reservation.rowCount){const existing=await client.query<{requestHash:string;responseBody:VendorPaymentSummary|null}>(`select request_hash as "requestHash",response_body as "responseBody"from idempotency_keys where firm_id=$1 and key=$2`,[firmId,idempotencyKey]);const previous=existing.rows[0];
        if(!previous||previous.requestHash!==requestHash)throw new IdempotencyConflictError();if(!previous.responseBody)throw new IdempotencyInProgressError();await client.query('commit');return previous.responseBody;}
      const bills=await client.query<{billNumber:string;billDate:string;balanceCents:string;status:string}>(`select bill_number::text as "billNumber",bill_date::text as "billDate",balance_cents::text as "balanceCents",status from vendor_bills where company_id=$1 and id=$2 for update`,[companyId,billId]);
      const bill=bills.rows[0];if(!bill||bill.status==='voided'||bill.status==='paid'||input.amountCents>Number(bill.balanceCents)||input.paymentDate<bill.billDate)throw new VendorPaymentAllocationError();
      const accounts=await client.query<{id:string;accountKind:string}>(`select id,account_kind as "accountKind"from accounts where company_id=$1 and active=true and(id=$2 or account_kind='accounts_payable')`,[companyId,input.bankAccountId]);
      const bank=accounts.rows.find((row)=>row.id===input.bankAccountId);const apId=accounts.rows.find((row)=>row.accountKind==='accounts_payable')?.id;if(!bank||bank.accountKind!=='bank'||!apId)throw new VendorBillAccountError();
      const entry=await client.query<{id:string}>(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)values($1,$2,$3,nullif(trim($4),''),$5,'vendor_payment',$6)returning id`,
        [firmId,companyId,input.paymentDate,input.reference??'',`Payment for bill ${bill.billNumber}`,userId]);const journalEntryId=entry.rows[0]?.id;if(!journalEntryId)throw new Error('journal_create_failed');
      const result=await client.query<VendorPaymentSummary>(`insert into vendor_payments(firm_id,company_id,bill_id,payment_date,amount_cents,bank_account_id,reference,journal_entry_id,created_by)
        values($1,$2,$3,$4,$5,$6,nullif(trim($7),''),$8,$9)returning id,bill_id as "billId",payment_date::text as "paymentDate",amount_cents::text as "amountCents",bank_account_id as "bankAccountId",reference,
        journal_entry_id as "journalEntryId",created_at as "createdAt"`,[firmId,companyId,billId,input.paymentDate,input.amountCents,input.bankAccountId,input.reference??'',journalEntryId,userId]);const payment=result.rows[0];if(!payment)throw new Error('vendor_payment_create_failed');
      await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents)values
        ($1,$2,$3,0,$4,$5,$6,0),($1,$2,$3,1,$7,$5,0,$6)`,[firmId,companyId,journalEntryId,apId,`Payment for bill ${bill.billNumber}`,input.amountCents,input.bankAccountId]);
      await client.query(`update journal_entries set status='posted'where id=$1`,[journalEntryId]);await client.query(`update vendor_bills set balance_cents=balance_cents-$2,status=case when balance_cents-$2=0 then'paid'else'partially_paid'end where id=$1`,[billId,input.amountCents]);
      await client.query(`update idempotency_keys set response_status=201,response_body=$3::jsonb where firm_id=$1 and key=$2`,[firmId,idempotencyKey,JSON.stringify(payment)]);await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state)
        values($1,$2,$3,'vendor.payment.posted','vendor_payment',$4,jsonb_build_object('billId',$5::text,'amountCents',$6::bigint))`,[firmId,companyId,userId,payment.id,billId,input.amountCents]);
      await client.query('commit');return payment;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async voidVendorBill(user:AuthenticatedUser,firmId:string,companyId:string,billId:string,idempotencyKey:string,requestHash:string,input:InvoiceVoidInput):Promise<VendorBillSummary>{
    const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);await this.#setCompanyContext(client,firmId,companyId,userId,true);
      await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`,[firmId,idempotencyKey]);const reservation=await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at)values($1,$2,$3,now()+interval'24 hours')on conflict(firm_id,key)do nothing`,[firmId,idempotencyKey,requestHash]);
      if(!reservation.rowCount){const existing=await client.query<{requestHash:string;responseBody:VendorBillSummary|null}>(`select request_hash as "requestHash",response_body as "responseBody"from idempotency_keys where firm_id=$1 and key=$2`,[firmId,idempotencyKey]);const previous=existing.rows[0];
        if(!previous||previous.requestHash!==requestHash)throw new IdempotencyConflictError();if(!previous.responseBody)throw new IdempotencyInProgressError();await client.query('commit');return previous.responseBody;}
      const bills=await client.query<{billNumber:string;billDate:string;status:string;totalCents:string;balanceCents:string;journalEntryId:string}>(`select bill_number::text as "billNumber",bill_date::text as "billDate",status,total_cents::text as "totalCents",balance_cents::text as "balanceCents",
        journal_entry_id as "journalEntryId"from vendor_bills where company_id=$1 and id=$2 for update`,[companyId,billId]);const bill=bills.rows[0];
      if(!bill||bill.status!=='posted'||bill.balanceCents!==bill.totalCents||input.voidDate<bill.billDate)throw new VendorBillVoidConflictError();
      const original=await client.query<{lineOrder:number;accountId:string;description:string|null;debitCents:string;creditCents:string;taxCode:string|null}>(`select line_order as "lineOrder",account_id as "accountId",description,debit_cents::text as "debitCents",credit_cents::text as "creditCents",tax_code as "taxCode"
        from journal_lines where journal_entry_id=$1 order by line_order`,[bill.journalEntryId]);const reversal=await client.query<{id:string}>(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values($1,$2,$3,$4,$5,'vendor_bill_void',$6)returning id`,[firmId,companyId,input.voidDate,`VOID-BILL-${bill.billNumber}`,input.reason.trim(),userId]);const reversalId=reversal.rows[0]?.id;if(!reversalId)throw new Error('bill_void_journal_failed');
      for(const line of original.rows)await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code)values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [firmId,companyId,reversalId,line.lineOrder,line.accountId,line.description,line.creditCents,line.debitCents,line.taxCode]);await client.query(`update journal_entries set status='posted'where id=$1`,[reversalId]);
      await client.query(`update vendor_bills set status='voided',balance_cents=0,void_journal_entry_id=$2,voided_at=now(),voided_by=$3,void_reason=$4 where id=$1`,[billId,reversalId,userId,input.reason.trim()]);
      const result=await client.query<VendorBillSummary>(`select vb.id,vb.vendor_id as "vendorId",cc.display_name as "vendorName",vb.bill_number::text as "billNumber",vb.vendor_invoice_number as "vendorInvoiceNumber",vb.bill_date::text as "billDate",
        vb.due_date::text as "dueDate",vb.memo,vb.status,vb.subtotal_cents::text as "subtotalCents",vb.hst_cents::text as "hstCents",vb.total_cents::text as "totalCents",vb.balance_cents::text as "balanceCents",
        vb.journal_entry_id as "journalEntryId",vb.version from vendor_bills vb join company_contacts cc on cc.id=vb.vendor_id where vb.id=$1`,[billId]);const response=result.rows[0];if(!response)throw new Error('bill_void_failed');
      await client.query(`update idempotency_keys set response_status=200,response_body=$3::jsonb where firm_id=$1 and key=$2`,[firmId,idempotencyKey,JSON.stringify(response)]);await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state)
        values($1,$2,$3,'bill.voided','vendor_bill',$4,jsonb_build_object('billNumber',$5::text,'reversalJournalId',$6::text,'reason',$7::text))`,[firmId,companyId,userId,billId,bill.billNumber,reversalId,input.reason.trim()]);
      await client.query('commit');return response;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }

  async createBankTransfer(user:AuthenticatedUser,firmId:string,companyId:string,idempotencyKey:string,requestHash:string,input:BankTransferInput):Promise<BankTransferSummary>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);
    await this.#setUserContext(client,userId);await this.#setCompanyContext(client,firmId,companyId,userId,true);await client.query(`delete from idempotency_keys where firm_id=$1 and key=$2 and expires_at<=now()`,[firmId,idempotencyKey]);
    const reservation=await client.query(`insert into idempotency_keys(firm_id,key,request_hash,expires_at)values($1,$2,$3,now()+interval'24 hours')on conflict(firm_id,key)do nothing`,[firmId,idempotencyKey,requestHash]);
    if(!reservation.rowCount){const existing=await client.query<{requestHash:string;responseBody:BankTransferSummary|null}>(`select request_hash as "requestHash",response_body as "responseBody"from idempotency_keys where firm_id=$1 and key=$2`,[firmId,idempotencyKey]);const previous=existing.rows[0];
      if(!previous||previous.requestHash!==requestHash)throw new IdempotencyConflictError();if(!previous.responseBody)throw new IdempotencyInProgressError();await client.query('commit');return previous.responseBody;}
    const accounts=await client.query<{id:string;name:string;accountType:string;accountKind:string}>(`select id,name,account_type as "accountType",account_kind as "accountKind"from accounts where company_id=$1 and id=any($2::uuid[])and active=true for update`,
      [companyId,[input.fromAccountId,input.toAccountId]]);const from=accounts.rows.find((row)=>row.id===input.fromAccountId);const to=accounts.rows.find((row)=>row.id===input.toAccountId);
    if(!from||!to||!['bank','credit_card'].includes(from.accountKind)||!['bank','credit_card'].includes(to.accountKind)||from.accountKind==='bank'&&from.accountType!=='asset'||from.accountKind==='credit_card'&&from.accountType!=='liability'||to.accountKind==='bank'&&to.accountType!=='asset'||to.accountKind==='credit_card'&&to.accountType!=='liability')throw new BankTransferAccountError();
    const entry=await client.query<{id:string}>(`insert into journal_entries(firm_id,company_id,transaction_date,memo,source,created_by)values($1,$2,$3,$4,'bank_transfer',$5)returning id`,[firmId,companyId,input.transferDate,input.memo?.trim()||`Transfer from ${from.name} to ${to.name}`,userId]);
    const journalEntryId=entry.rows[0]?.id;if(!journalEntryId)throw new Error('journal_create_failed');await client.query(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents)values
      ($1,$2,$3,0,$4,$6,$7,0),($1,$2,$3,1,$5,$6,0,$7)`,[firmId,companyId,journalEntryId,to.id,from.id,`Transfer ${from.name} to ${to.name}`,input.amountCents]);await client.query(`update journal_entries set status='posted'where id=$1`,[journalEntryId]);
    const result=await client.query<BankTransferSummary>(`insert into bank_transfers(firm_id,company_id,transfer_date,from_account_id,to_account_id,amount_cents,memo,journal_entry_id,created_by)values($1,$2,$3,$4,$5,$6,nullif(trim($7),''),$8,$9)
      returning id,transfer_date::text as "transferDate",from_account_id as "fromAccountId",$10::text as "fromAccountName",to_account_id as "toAccountId",$11::text as "toAccountName",amount_cents::text as "amountCents",memo,journal_entry_id as "journalEntryId",created_at as "createdAt"`,
      [firmId,companyId,input.transferDate,from.id,to.id,input.amountCents,input.memo??'',journalEntryId,userId,from.name,to.name]);const transfer=result.rows[0];if(!transfer)throw new Error('bank_transfer_create_failed');
    await client.query(`update idempotency_keys set response_status=201,response_body=$3::jsonb where firm_id=$1 and key=$2`,[firmId,idempotencyKey,JSON.stringify(transfer)]);await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state)values($1,$2,$3,'bank.transfer_posted','bank_transfer',$4,
      jsonb_build_object('fromAccountId',$5::text,'toAccountId',$6::text,'amountCents',$7::bigint))`,[firmId,companyId,userId,transfer.id,from.id,to.id,input.amountCents]);await client.query('commit');return transfer;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async createBankCsvImport(user:AuthenticatedUser,firmId:string,companyId:string,input:{accountId:string;sourceName:string;contentSha256:string;rows:ParsedBankRow[]}):Promise<BankImportSummary>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);
    await this.#setUserContext(client,userId);await this.#setCompanyContext(client,firmId,companyId,userId,true);const account=await client.query<{accountKind:string}>(`select account_kind as "accountKind"from accounts where company_id=$1 and id=$2 and active=true`,[companyId,input.accountId]);
    if(!['bank','credit_card'].includes(account.rows[0]?.accountKind??''))throw new BankTransferAccountError();const batch=await client.query<{id:string;createdAt:string}>(`insert into bank_import_batches(firm_id,company_id,account_id,source_type,source_name,content_sha256,created_by)
      values($1,$2,$3,'csv',$4,$5,$6)returning id,created_at as "createdAt"`,[firmId,companyId,input.accountId,input.sourceName,input.contentSha256,userId]);const batchId=batch.rows[0]?.id;if(!batchId)throw new Error('bank_import_create_failed');
    let imported=0;for(const row of input.rows){const result=await client.query(`insert into bank_import_rows(firm_id,company_id,batch_id,account_id,posted_date,description,reference,amount_cents,external_transaction_id,dedup_hash)
      values($1,$2,$3,$4,$5,$6,nullif(trim($7),''),$8,nullif(trim($9),''),$10)on conflict(company_id,account_id,dedup_hash)do nothing`,[firmId,companyId,batchId,input.accountId,row.postedDate,row.description,row.reference??'',row.amountCents,row.externalTransactionId??'',row.dedupHash]);imported+=result.rowCount??0;}
    await client.query(`update bank_import_batches set row_count=$2 where id=$1`,[batchId,imported]);await client.query(`insert into audit_events(firm_id,company_id,actor_user_id,event_type,entity_type,entity_id,after_state)values($1,$2,$3,'bank.csv_imported','bank_import_batch',$4,
      jsonb_build_object('accountId',$5::text,'sourceName',$6::text,'sourceRows',$7::integer,'importedRows',$8::integer))`,[firmId,companyId,userId,batchId,input.accountId,input.sourceName,input.rows.length,imported]);await client.query('commit');return{id:batchId,accountId:input.accountId,sourceName:input.sourceName,rowCount:input.rows.length,importedRowCount:imported,duplicateRowCount:input.rows.length-imported,createdAt:batch.rows[0]?.createdAt??''};
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async listBankImportRows(user:AuthenticatedUser,firmId:string,companyId:string,accountId?:string):Promise<BankImportRowSummary[]>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    await this.#setCompanyContext(client,firmId,companyId,userId,false,true);const result=await client.query<BankImportRowSummary>(`select id,account_id as "accountId",posted_date::text as "postedDate",description,reference,amount_cents::text as "amountCents",status,matched_journal_entry_id as "matchedJournalEntryId",created_at as "createdAt"
      from bank_import_rows where company_id=$1 and($2::uuid is null or account_id=$2)order by posted_date desc,created_at desc limit 1000`,[companyId,accountId??null]);await client.query('commit');return result.rows;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async createEmailMfaChallenge(user:AuthenticatedUser,codeHash:string,expiresAt:string):Promise<string>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    const result=await client.query<{id:string}>(`select create_email_mfa_challenge($1,$2) as id`,[codeHash,expiresAt]);const id=result.rows[0]?.id;if(!id)throw new Error('mfa_challenge_create_failed');await client.query('commit');return id;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async consumeEmailMfaChallenge(user:AuthenticatedUser,challengeId:string,codeHash:string):Promise<boolean>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    const result=await client.query<{accepted:boolean}>(`select consume_email_mfa_challenge($1,$2) as accepted`,[challengeId,codeHash]);await client.query('commit');return result.rows[0]?.accepted===true;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async getPlatformRole(user:AuthenticatedUser):Promise<PlatformRole|null>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    const result=await client.query<{role:PlatformRole|null}>(`select current_user_platform_role() as role`);await client.query('commit');return result.rows[0]?.role??null;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async listPlatformSubscriptions(user:AuthenticatedUser):Promise<PlatformSubscriptionSummary[]>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    const result=await client.query<PlatformSubscriptionSummary>(`select firm_id as "firmId",firm_name as "firmName",plan_code as "planCode",plan_name as "planName",status,seat_limit as "seatLimit",current_period_end as "currentPeriodEnd",version::text from platform_list_subscriptions()`);
    await client.query('commit');return result.rows;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async listPlatformSubscriptionActions(user:AuthenticatedUser,limit=100):Promise<PlatformSubscriptionActionSummary[]>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    const result=await client.query<PlatformSubscriptionActionSummary>(`select id::text,firm_id as "firmId",firm_name as "firmName",actor_name as "actorName",actor_email as "actorEmail",action,reason,created_at as "createdAt" from platform_list_subscription_actions($1)`,[Math.max(1,Math.min(limit,500))]);
    await client.query('commit');return result.rows;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async managePlatformSubscription(user:AuthenticatedUser,firmId:string,input:PlatformSubscriptionChange):Promise<void>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);await this.#setUserContext(client,userId);
    await client.query(`select platform_manage_subscription($1,$2,$3,$4,$5,$6)`,[firmId,input.planCode,input.status,input.periodEnd,input.action,input.reason]);await client.query('commit');
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async createFirmInvitation(user: AuthenticatedUser, firmId: string, input: CreateInvitationInput): Promise<FirmInvitationSummary> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await this.#requireFirmAdministrator(client, firmId, userId);
      await client.query(`select set_config('app.firm_id', $1, true)`, [firmId]);
      await client.query(`
        update firm_invitations set revoked_at = now()
        where firm_id = $1 and email = lower(trim($2))
          and accepted_at is null and revoked_at is null and expires_at <= now()
      `, [firmId, input.email]);
      const result = await client.query<FirmInvitationSummary>(`
        insert into firm_invitations(firm_id, email, role, token_hash, invited_by, expires_at)
        values ($1, lower(trim($2)), $3, $4, $5, $6)
        returning id,email,role,expires_at as "expiresAt",'{}'::text[] as "companyIds",'{}'::text[] as "companyNames"
      `, [firmId, input.email, input.role, input.tokenHash, userId, input.expiresAt]);
      const invitation = result.rows[0];
      if (!invitation) throw new Error('invitation_create_failed');
      if(input.role!=='firm_admin'&&input.companyIds.length===0)throw new Error('company_access_required');
      const selected=await client.query<{id:string;legalName:string}>(`select id,legal_name as "legalName"from companies where firm_id=$1 and id=any($2::uuid[])and archived_at is null`,[firmId,input.companyIds]);
      if(selected.rows.length!==new Set(input.companyIds).size)throw new TenantAccessDeniedError();
      for(const company of selected.rows)await client.query(`insert into firm_invitation_company_access(invitation_id,firm_id,company_id)values($1,$2,$3)`,[invitation.id,firmId,company.id]);
      invitation.companyIds=selected.rows.map((company)=>company.id);invitation.companyNames=selected.rows.map((company)=>company.legalName);
      await client.query(`
        insert into audit_events(firm_id, actor_user_id, request_id, event_type, entity_type, entity_id, after_state)
        values ($1, $2, null, 'seat.invited', 'firm_invitation', $3,
          jsonb_build_object('email',$4::text,'role',$5::text,'expiresAt',$6::text,'companyIds',$7::jsonb))
      `,[firmId,userId,invitation.id,invitation.email,invitation.role,invitation.expiresAt,JSON.stringify(invitation.companyIds)]);
      await client.query('commit');
      return invitation;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeFirmInvitation(user:AuthenticatedUser,firmId:string,invitationId:string):Promise<void>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);
    await this.#setUserContext(client,userId);await this.#requireFirmAdministrator(client,firmId,userId);await client.query(`select set_config('app.firm_id',$1,true)`,[firmId]);
    const revoked=await client.query<{email:string}>(`update firm_invitations set revoked_at=now()where firm_id=$1 and id=$2 and accepted_at is null and revoked_at is null returning email`,[firmId,invitationId]);
    if(!revoked.rowCount)throw new InvitationInvalidError();await client.query(`insert into audit_events(firm_id,actor_user_id,event_type,entity_type,entity_id,after_state)values($1,$2,'seat.invitation_revoked','firm_invitation',$3,
      jsonb_build_object('email',$4::text))`,[firmId,userId,invitationId,revoked.rows[0]?.email??'']);await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async requestFirmSeatLimit(user:AuthenticatedUser,firmId:string,requestedSeatLimit:number):Promise<SeatChangeRequestSummary>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);
    await this.#setUserContext(client,userId);await this.#requireFirmAdministrator(client,firmId,userId);await client.query(`select set_config('app.firm_id',$1,true)`,[firmId]);
    const firm=await client.query<{seatLimit:number}>(`select seat_limit as "seatLimit"from firms where id=$1 and status='active'for update`,[firmId]);const current=firm.rows[0]?.seatLimit;
    if(current===undefined||!Number.isSafeInteger(requestedSeatLimit)||requestedSeatLimit<=current||requestedSeatLimit>10000)throw new Error('invalid_seat_limit');
    const result=await client.query<SeatChangeRequestSummary>(`insert into firm_seat_change_requests(firm_id,requested_by,current_seat_limit,requested_seat_limit)values($1,$2,$3,$4)
      returning id,current_seat_limit as "currentSeatLimit",requested_seat_limit as "requestedSeatLimit",status,created_at as "createdAt"`,[firmId,userId,current,requestedSeatLimit]);
    const request=result.rows[0];if(!request)throw new Error('seat_change_request_failed');await client.query(`insert into audit_events(firm_id,actor_user_id,event_type,entity_type,entity_id,after_state)values($1,$2,'seat.increase_requested','seat_change_request',$3,
      jsonb_build_object('currentSeatLimit',$4::integer,'requestedSeatLimit',$5::integer))`,[firmId,userId,request.id,current,requestedSeatLimit]);await client.query('commit');return request;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async acceptFirmInvitation(user: AuthenticatedUser, tokenHash: string): Promise<{ firmId: string; role: FirmRole }> {
    if (!user.email) throw new InvitationEmailRequiredError();
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      const result = await client.query<{ firmId: string; role: FirmRole }>(
        `select firm_id as "firmId", role from accept_firm_invitation($1, $2)`,
        [tokenHash, user.email],
      );
      const accepted = result.rows[0];
      if (!accepted) throw new InvitationInvalidError();
      await client.query('commit');
      return accepted;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async suspendFirmMembership(user: AuthenticatedUser, firmId: string, targetUserId: string): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const userId = await this.#upsertUser(client, user);
      await this.#setUserContext(client, userId);
      await client.query(`select suspend_firm_membership($1, $2)`, [firmId, targetUserId]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async setFirmMemberCompanyAccess(user:AuthenticatedUser,firmId:string,targetUserId:string,companyIds:string[]):Promise<void>{const client=await this.#pool.connect();try{await client.query('begin');const userId=await this.#upsertUser(client,user);
    await this.#setUserContext(client,userId);await this.#requireFirmAdministrator(client,firmId,userId);await client.query(`select set_config('app.firm_id',$1,true)`,[firmId]);
    const target=await client.query<{role:FirmRole}>(`select role from firm_memberships where firm_id=$1 and user_id=$2 and status='active'for update`,[firmId,targetUserId]);const role=target.rows[0]?.role;
    if(!role||role==='owner'||role==='firm_admin'||companyIds.length===0)throw new Error('company_access_update_rejected');
    const selected=await client.query<{id:string}>(`select id from companies where firm_id=$1 and id=any($2::uuid[])and archived_at is null`,[firmId,companyIds]);if(selected.rows.length!==new Set(companyIds).size)throw new TenantAccessDeniedError();
    await client.query(`delete from company_member_access where firm_id=$1 and user_id=$2`,[firmId,targetUserId]);for(const company of selected.rows)await client.query(`insert into company_member_access(firm_id,company_id,user_id,granted_by)values($1,$2,$3,$4)`,[firmId,company.id,targetUserId,userId]);
    await client.query(`insert into audit_events(firm_id,actor_user_id,event_type,entity_type,entity_id,after_state)values($1,$2,'seat.client_access_changed','firm_membership',$3,jsonb_build_object('companyIds',$4::jsonb))`,
      [firmId,userId,targetUserId,JSON.stringify(companyIds)]);await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}}

  async #upsertUser(client: pg.PoolClient, user: AuthenticatedUser): Promise<string> {
    const result = await client.query<{ id: string }>(`
      insert into app_users (entra_object_id, subject, email, display_name, last_sign_in_at)
      values ($1, $2, $3, $4, now())
      on conflict (entra_object_id) do update
      set subject = excluded.subject,
          email = coalesce(excluded.email, app_users.email),
          display_name = coalesce(excluded.display_name, app_users.display_name),
          last_sign_in_at = now()
      returning id
    `, [user.objectId, user.subject, user.email, user.displayName]);
    const row = result.rows[0];
    if (!row) throw new Error('user_upsert_failed');
    return row.id;
  }

  async #setUserContext(client: pg.PoolClient, userId: string): Promise<void> {
    await client.query(`select set_config('app.user_id', $1, true)`, [userId]);
  }

  async #requireFirmAdministrator(client: pg.PoolClient, firmId: string, userId: string): Promise<void> {
    const membership = await client.query<{ role: FirmRole }>(`
      select role from firm_memberships
      where firm_id = $1 and user_id = $2 and status = 'active'
    `, [firmId, userId]);
    const role = membership.rows[0]?.role;
    if (role !== 'owner' && role !== 'firm_admin') throw new TenantAccessDeniedError();
  }

  async #setCompanyContext(
    client: pg.PoolClient,
    firmId: string,
    companyId: string,
    userId: string,
    requireWrite: boolean,
    requireAdvancedRead = false,
    allowEssentialsSimple = false,
  ): Promise<FirmRole> {
    const membership = await client.query<{ role: FirmRole }>(`
      select role from firm_memberships
      where firm_id = $1 and user_id = $2 and status = 'active'
    `, [firmId, userId]);
    const role = membership.rows[0]?.role;
    if (!role) throw new TenantAccessDeniedError();
    await client.query(`select set_config('app.firm_id', $1, true)`, [firmId]);
    await client.query(`select set_config('app.company_id', $1, true)`, [companyId]);
    const company = await client.query(`select 1 from companies where id = $1 and firm_id = $2 and archived_at is null`, [companyId, firmId]);
    if (!company.rowCount) throw new TenantAccessDeniedError();
    const subscription = await client.query<{ planCode: SubscriptionPlanCode; status: SubscriptionStatus }>(`
      select plan_code as "planCode", status from firm_subscriptions where firm_id = $1
    `, [firmId]);
    const active = subscription.rows[0];
    if (!active || active.status === 'canceled' || active.status === 'suspended') throw new SubscriptionAccessDeniedError();
    if (requireWrite && active.status !== 'active' && active.status !== 'trialing') {
      throw new SubscriptionReadOnlyError();
    }
    if (requireWrite && !['owner', 'firm_admin', 'accountant', 'bookkeeper'].includes(role)) {
      throw new TenantAccessDeniedError();
    }
    if ((requireWrite || requireAdvancedRead) && active.planCode === 'essentials' && !allowEssentialsSimple && role !== 'firm_admin' && role !== 'accountant') {
      throw new TenantAccessDeniedError();
    }
    return role;
  }
}

export class TenantAccessDeniedError extends Error {
  constructor() {
    super('tenant_access_denied');
    this.name = 'TenantAccessDeniedError';
  }
}

export class InvitationEmailRequiredError extends Error {
  constructor() {
    super('verified_email_required');
    this.name = 'InvitationEmailRequiredError';
  }
}

export class InvitationInvalidError extends Error {
  constructor() {
    super('invitation_invalid');
    this.name = 'InvitationInvalidError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('idempotency_key_reused_for_different_request');
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyInProgressError extends Error {
  constructor() {
    super('idempotent_request_in_progress');
    this.name = 'IdempotencyInProgressError';
  }
}

export class SubscriptionAccessDeniedError extends Error {
  constructor() {
    super('subscription_access_denied');
    this.name = 'SubscriptionAccessDeniedError';
  }
}

export class SubscriptionReadOnlyError extends Error {
  constructor() {
    super('subscription_read_only');
    this.name = 'SubscriptionReadOnlyError';
  }
}

export class BusinessTransactionAccountError extends Error {
  constructor() {
    super('invalid_business_transaction_account');
    this.name = 'BusinessTransactionAccountError';
  }
}

export class SalesInvoiceAccountError extends Error {
  constructor() { super('invalid_sales_invoice_account'); this.name = 'SalesInvoiceAccountError'; }
}

export class SalesInvoiceCustomerError extends Error {
  constructor() { super('invalid_sales_invoice_customer'); this.name = 'SalesInvoiceCustomerError'; }
}

export class SalesInvoiceProductError extends Error {
  constructor() { super('invalid_sales_invoice_product'); this.name = 'SalesInvoiceProductError'; }
}

export class CustomerPaymentAllocationError extends Error {
  constructor() { super('invalid_customer_payment_allocation'); this.name='CustomerPaymentAllocationError'; }
}

export class ProductVersionConflictError extends Error {
  constructor(){super('product_version_conflict');this.name='ProductVersionConflictError';}
}
export class SalesInvoiceNotFoundError extends Error{constructor(){super('sales_invoice_not_found');this.name='SalesInvoiceNotFoundError';}}
export class InvoiceVoidConflictError extends Error{constructor(){super('invoice_cannot_be_voided');this.name='InvoiceVoidConflictError';}}
export class VendorBillAccountError extends Error{constructor(){super('invalid_vendor_bill_account');this.name='VendorBillAccountError';}}
export class VendorBillVendorError extends Error{constructor(){super('invalid_vendor_bill_vendor');this.name='VendorBillVendorError';}}
export class VendorBillNotFoundError extends Error{constructor(){super('vendor_bill_not_found');this.name='VendorBillNotFoundError';}}
export class VendorPaymentAllocationError extends Error{constructor(){super('invalid_vendor_payment_allocation');this.name='VendorPaymentAllocationError';}}
export class VendorBillVoidConflictError extends Error{constructor(){super('vendor_bill_cannot_be_voided');this.name='VendorBillVoidConflictError';}}
export class BankTransferAccountError extends Error{constructor(){super('invalid_bank_transfer_account');this.name='BankTransferAccountError';}}
