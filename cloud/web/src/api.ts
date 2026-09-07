export interface Firm { id: string; name: string; role: string; workspaceType: 'cpa_firm' | 'business' }
export interface Company { id: string; legalName: string; operatingName: string | null; version: number }
export interface Account {
  id: string; name: string; internalCode: string | null;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  accountKind: string; parentAccountId: string | null; isMaster: boolean; active: boolean; version: number;
}
export interface Capabilities {
  showSimpleDashboard: boolean; showAdvancedAccounting: boolean; canEnterSalesAndExpenses: boolean;
  canPrepareTaxes: boolean; canPostAdjustments: boolean; canRunPayroll: boolean;
}
export interface SubscriptionResponse {
  subscription: { planCode: string; displayName: string; status: string; workspaceType: 'cpa_firm' | 'business'; role: string };
  entitlements: Record<string, boolean>;
  capabilities: Capabilities;
}
export type FirmRole='owner'|'firm_admin'|'accountant'|'bookkeeper'|'payroll'|'viewer';
export interface FirmSeatSummary {seatLimit:number;occupiedSeats:number;pendingSeats:number;
  members:{userId:string;displayName:string|null;email:string|null;role:FirmRole;status:'active'|'suspended';companyIds:string[];companyNames:string[]}[];
  invitations:{id:string;email:string;role:FirmRole;expiresAt:string;companyIds:string[];companyNames:string[]}[];
  pendingSeatChange:{id:string;currentSeatLimit:number;requestedSeatLimit:number;status:string;createdAt:string}|null;
}
export interface BusinessTransaction {
  id: string; transactionType: 'sale' | 'expense'; transactionDate: string; description: string;
  counterpartyName: string | null; taxCode: string; baseCents: string; hstCents: string;
  totalCents: string; journalEntryId: string; createdAt: string;
}
export interface SalesTaxSummary {
  salesBaseCents: string; hstCollectedCents: string; expenseBaseCents: string;
  itcPaidCents: string; netHstPayableCents: string;
}
export interface SalesTaxCategorySummary{accountId:string;accountName:string;eventType:'sales_collected'|'itc_paid';baseCents:string;hstCents:string}
export interface CompanyContact {
  id: string; contactType: 'customer' | 'vendor' | 'both'; entityType: 'business' | 'person';
  displayName: string; companyName: string | null; firstName: string | null; lastName: string | null;
  email: string | null; phone: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; province: string | null; postalCode: string | null; dateOfBirth: string | null;
  sinLastFour: string | null; hasSin: boolean; notes: string | null; version: number;
}
export interface ProductService {
  id:string;itemType:'product'|'service';name:string;description:string|null;sku:string|null;
  unitPriceCents:string;revenueAccountId:string;defaultTaxCode:'hst_13'|'hst_exempt'|'manual_hst';active:boolean;version:number;
}
export interface SalesInvoice {
  id:string;customerId:string;customerName:string;invoiceNumber:string;invoiceDate:string;dueDate:string;memo:string|null;
  status:'posted'|'partially_paid'|'paid'|'voided';subtotalCents:string;hstCents:string;totalCents:string;balanceCents:string;journalEntryId:string;version:number;
}
export interface SalesInvoiceLine{ id:string;lineNumber:number;productId:string|null;description:string;quantityMilli:string;unitPriceCents:string;
  revenueAccountId:string;taxCode:'hst_13'|'hst_exempt'|'manual_hst';baseCents:string;hstCents:string;totalCents:string }
export interface SalesInvoiceDetail extends SalesInvoice{lines:SalesInvoiceLine[]}
export interface VendorBill {
  id:string;vendorId:string;vendorName:string;billNumber:string;vendorInvoiceNumber:string;billDate:string;dueDate:string;memo:string|null;
  status:'posted'|'partially_paid'|'paid'|'voided';subtotalCents:string;hstCents:string;totalCents:string;balanceCents:string;journalEntryId:string;version:number;
}
export interface VendorBillLine {id:string;lineNumber:number;description:string;expenseAccountId:string;
  taxCode:'hst_13'|'hst_exempt'|'manual_hst';baseCents:string;hstCents:string;totalCents:string}
export interface VendorBillDetail extends VendorBill {lines:VendorBillLine[]}
export interface BankTransfer{id:string;transferDate:string;fromAccountId:string;fromAccountName:string;toAccountId:string;toAccountName:string;amountCents:string;memo:string|null;journalEntryId:string;createdAt:string}
export interface BankImportRow{id:string;accountId:string;postedDate:string;description:string;reference:string|null;amountCents:string;status:'unmatched'|'matched'|'excluded';matchedJournalEntryId:string|null;createdAt:string}
export type PlatformRole='platform_admin'|'customer_support';
export interface PlatformSubscription{firmId:string;firmName:string;planCode:'essentials'|'accounting'|'accounting_payroll';planName:string;status:'trialing'|'active'|'past_due'|'suspended'|'canceled';seatLimit:number;currentPeriodEnd:string|null;version:string}
export interface PlatformSubscriptionAction{id:string;firmId:string;firmName:string;actorName:string;actorEmail:string;action:string;reason:string;createdAt:string}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApexLedgerApi {
  constructor(private readonly tokenProvider: () => Promise<string>) {}

  private mfaSessionToken=sessionStorage.getItem('apexLedger.mfaSession')??'';
  hasActiveMfaSession(){
    const expiresAt=Number(sessionStorage.getItem('apexLedger.mfaSessionExpiresAt')??'0');
    if(this.mfaSessionToken&&expiresAt>Date.now()+30_000)return true;
    this.clearMfaSession();return false;
  }
  getPendingMfaChallenge(){
    try{
      const value=JSON.parse(sessionStorage.getItem('apexLedger.mfaChallenge')??'null') as {challengeId?:string;destination?:string;expiresAt?:string}|null;
      if(value?.challengeId&&value.expiresAt&&Date.parse(value.expiresAt)>Date.now())return value;
    }catch{/* Discard malformed browser state. */}
    sessionStorage.removeItem('apexLedger.mfaChallenge');return null;
  }
  clearMfaSession(){this.mfaSessionToken='';sessionStorage.removeItem('apexLedger.mfaSession');sessionStorage.removeItem('apexLedger.mfaSessionExpiresAt');sessionStorage.removeItem('apexLedger.mfaChallenge');}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.tokenProvider();
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    if(this.mfaSessionToken)headers.set('x-apex-2fa',this.mfaSessionToken);
    const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      ...init,
      headers,
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error : 'request_failed';
      const message = typeof body.message === 'string' ? body.message : code;
      throw new ApiError(response.status, code, message);
    }
    return body as T;
  }

  firms() { return this.request<{ firms: Firm[] }>('/v1/me/firms'); }
  async startEmailMfa(){const response=await this.request<{required:boolean;challengeId?:string;destination?:string;expiresAt?:string}>('/v1/auth/email-2fa/challenge',{method:'POST'});
    if(response.required&&response.challengeId&&response.expiresAt)sessionStorage.setItem('apexLedger.mfaChallenge',JSON.stringify(response));return response;}
  async verifyEmailMfa(challengeId:string,code:string){const response=await this.request<{sessionToken:string;expiresInSeconds:number}>('/v1/auth/email-2fa/verify',{method:'POST',body:JSON.stringify({challengeId,code})});
    this.mfaSessionToken=response.sessionToken;sessionStorage.setItem('apexLedger.mfaSession',response.sessionToken);
    sessionStorage.setItem('apexLedger.mfaSessionExpiresAt',String(Date.now()+response.expiresInSeconds*1000));sessionStorage.removeItem('apexLedger.mfaChallenge');return response;}
  platformMe(){return this.request<{role:PlatformRole|null}>('/v1/platform/me');}
  platformSubscriptions(){return this.request<{subscriptions:PlatformSubscription[]}>('/v1/platform/subscriptions');}
  platformSubscriptionActions(){return this.request<{actions:PlatformSubscriptionAction[]}>('/v1/platform/subscription-actions');}
  managePlatformSubscription(firmId:string,input:Record<string,unknown>){return this.request<void>(`/v1/platform/subscriptions/${firmId}`,{method:'PATCH',body:JSON.stringify(input)});}
  companies(firmId: string) { return this.request<{ companies: Company[] }>(`/v1/firms/${firmId}/companies`); }
  subscription(firmId: string) { return this.request<SubscriptionResponse>(`/v1/firms/${firmId}/subscription`); }
  seats(firmId:string){return this.request<FirmSeatSummary>(`/v1/firms/${firmId}/seats`);}
  inviteSeat(firmId:string,email:string,role:Exclude<FirmRole,'owner'>,companyIds:string[]){return this.request<{invitation:FirmSeatSummary['invitations'][number];acceptUrl:string}>(
    `/v1/firms/${firmId}/invitations`,{method:'POST',body:JSON.stringify({email,role,companyIds})});}
  acceptInvitation(token:string){return this.request<{membership:{firmId:string;role:FirmRole}}>(`/v1/invitations/accept`,{method:'POST',body:JSON.stringify({token})});}
  revokeInvitation(firmId:string,invitationId:string){return this.request<void>(`/v1/firms/${firmId}/invitations/${invitationId}`,{method:'DELETE'});}
  suspendSeat(firmId:string,userId:string){return this.request<void>(`/v1/firms/${firmId}/members/${userId}`,{method:'DELETE'});}
  setSeatCompanyAccess(firmId:string,userId:string,companyIds:string[]){return this.request<void>(`/v1/firms/${firmId}/members/${userId}/company-access`,{method:'PUT',body:JSON.stringify({companyIds})});}
  requestMoreSeats(firmId:string,requestedSeatLimit:number){return this.request<{request:FirmSeatSummary['pendingSeatChange']}>(
    `/v1/firms/${firmId}/seat-change-requests`,{method:'POST',body:JSON.stringify({requestedSeatLimit})});}
  accounts(firmId: string, companyId: string) {
    return this.request<{ accounts: Account[] }>(`/v1/firms/${firmId}/companies/${companyId}/accounts`);
  }
  taxSuggestion(description: string) {
    return this.request<{ suggestion: { taxCode: 'hst_13' | 'hst_exempt'; reason: string }; requiresConfirmation: true }>(
      `/v1/tax-suggestion?description=${encodeURIComponent(description)}`,
    );
  }
  transactions(firmId: string, companyId: string, startDate: string, endDate: string) {
    return this.request<{ transactions: BusinessTransaction[] }>(
      `/v1/firms/${firmId}/companies/${companyId}/business-transactions?startDate=${startDate}&endDate=${endDate}`,
    );
  }
  salesTaxSummary(firmId: string, companyId: string, startDate: string, endDate: string) {
    return this.request<{ summary: SalesTaxSummary }>(
      `/v1/firms/${firmId}/companies/${companyId}/sales-tax-summary?startDate=${startDate}&endDate=${endDate}`,
    );
  }
  salesTaxCategories(firmId:string,companyId:string,startDate:string,endDate:string){return this.request<{categories:SalesTaxCategorySummary[]}>(
    `/v1/firms/${firmId}/companies/${companyId}/sales-tax-summary/categories?startDate=${startDate}&endDate=${endDate}`);}
  createTransaction(firmId: string, companyId: string, input: Record<string, unknown>) {
    return this.request<{ transaction: BusinessTransaction }>(
      `/v1/firms/${firmId}/companies/${companyId}/business-transactions`,
      { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input) },
    );
  }
  contacts(firmId: string, companyId: string, query = '', contactType = '') {
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set('q', query.trim());
    if (contactType) parameters.set('contactType', contactType);
    const suffix = parameters.size ? `?${parameters.toString()}` : '';
    return this.request<{ contacts: CompanyContact[] }>(
      `/v1/firms/${firmId}/companies/${companyId}/contacts${suffix}`,
    );
  }
  createContact(firmId: string, companyId: string, input: Record<string, unknown>) {
    return this.request<{ contact: CompanyContact }>(
      `/v1/firms/${firmId}/companies/${companyId}/contacts`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  productsServices(firmId:string,companyId:string){return this.request<{products:ProductService[]}>(`/v1/firms/${firmId}/companies/${companyId}/products-services`);}
  createProductService(firmId:string,companyId:string,input:Record<string,unknown>){return this.request<{product:ProductService}>(
    `/v1/firms/${firmId}/companies/${companyId}/products-services`,{method:'POST',body:JSON.stringify(input)});}
  updateProductService(firmId:string,companyId:string,productId:string,input:Record<string,unknown>){return this.request<{product:ProductService}>(
    `/v1/firms/${firmId}/companies/${companyId}/products-services/${productId}`,{method:'PATCH',body:JSON.stringify(input)});}
  salesInvoices(firmId:string,companyId:string){return this.request<{invoices:SalesInvoice[]}>(`/v1/firms/${firmId}/companies/${companyId}/sales-invoices`);}
  createSalesInvoice(firmId:string,companyId:string,input:Record<string,unknown>){return this.request<{invoice:SalesInvoice}>(
    `/v1/firms/${firmId}/companies/${companyId}/sales-invoices`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});}
  receiveCustomerPayment(firmId:string,companyId:string,invoiceId:string,input:Record<string,unknown>){return this.request(
    `/v1/firms/${firmId}/companies/${companyId}/sales-invoices/${invoiceId}/payments`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});}
  salesInvoice(firmId:string,companyId:string,invoiceId:string){return this.request<{invoice:SalesInvoiceDetail}>(
    `/v1/firms/${firmId}/companies/${companyId}/sales-invoices/${invoiceId}`);}
  voidSalesInvoice(firmId:string,companyId:string,invoiceId:string,reason:string){return this.request<{invoice:SalesInvoice}>(
    `/v1/firms/${firmId}/companies/${companyId}/sales-invoices/${invoiceId}/void`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({voidDate:new Date().toISOString().slice(0,10),reason})});}
  vendorBills(firmId:string,companyId:string){return this.request<{bills:VendorBill[]}>(`/v1/firms/${firmId}/companies/${companyId}/vendor-bills`);}
  createVendorBill(firmId:string,companyId:string,input:Record<string,unknown>){return this.request<{bill:VendorBill}>(
    `/v1/firms/${firmId}/companies/${companyId}/vendor-bills`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});}
  vendorBill(firmId:string,companyId:string,billId:string){return this.request<{bill:VendorBillDetail}>(
    `/v1/firms/${firmId}/companies/${companyId}/vendor-bills/${billId}`);}
  payVendorBill(firmId:string,companyId:string,billId:string,input:Record<string,unknown>){return this.request(
    `/v1/firms/${firmId}/companies/${companyId}/vendor-bills/${billId}/payments`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});}
  voidVendorBill(firmId:string,companyId:string,billId:string,reason:string){return this.request<{bill:VendorBill}>(
    `/v1/firms/${firmId}/companies/${companyId}/vendor-bills/${billId}/void`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({voidDate:new Date().toISOString().slice(0,10),reason})});}
  createBankTransfer(firmId:string,companyId:string,input:Record<string,unknown>){return this.request<{transfer:BankTransfer}>(
    `/v1/firms/${firmId}/companies/${companyId}/bank-transfers`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});}
  importBankCsv(firmId:string,companyId:string,input:Record<string,unknown>){return this.request<{batch:{id:string;rowCount:number;importedRowCount:number;duplicateRowCount:number}}>(
    `/v1/firms/${firmId}/companies/${companyId}/bank-imports/csv`,{method:'POST',body:JSON.stringify(input)});}
  bankImportRows(firmId:string,companyId:string,accountId=''){return this.request<{rows:BankImportRow[]}>(`/v1/firms/${firmId}/companies/${companyId}/bank-import-rows${accountId?`?accountId=${encodeURIComponent(accountId)}`:''}`);}
}
