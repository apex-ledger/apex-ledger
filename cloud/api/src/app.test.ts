import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from './app.js';
import type { AuthenticatedUser } from './auth.js';
import type { AppConfig } from './config.js';
import { TenantAccessDeniedError } from './db.js';

const config: AppConfig = {
  NODE_ENV: 'test', PORT: 8080, APP_VERSION: 'test', AZURE_REGION: 'canadacentral',
  DATABASE_URL: 'postgres://example.invalid/db', DATABASE_POOL_MAX: 2, DATABASE_QUERY_TIMEOUT_MS: 5_000,
  AUTH_ISSUER: 'https://issuer.example/',
  AUTH_AUDIENCE: 'northledger-test', AUTH_JWKS_URI: 'https://issuer.example/jwks',
  INVITATION_BASE_URL: 'https://ledger.example/accept-invitation', ALLOWED_ORIGINS: '',
  CONTACT_SEARCH_HMAC_SECRET: 'test-only-secret-with-at-least-32-characters',
  MFA_REQUIRED:false,MFA_HMAC_SECRET:'test-mfa-secret-with-at-least-32-characters',EMAIL_FROM_ADDRESS:'security@apexledger.example',
};
const user = { objectId: 'oid-1', subject: 'sub-1', email: 'a@example.com', displayName: 'A' };
const database = {
  ping: async () => {},
  listUserFirms: async () => [],
  listFirmCompanies: async () => [],
  listFirmSeats: async () => ({ seatLimit: 2, occupiedSeats: 1, pendingSeats: 0, members: [], invitations: [],pendingSeatChange:null }),
  createFirmInvitation: async (_user: typeof user, _firmId: string, input: { email: string; role: 'firm_admin' | 'accountant' | 'bookkeeper' | 'payroll' | 'viewer'; tokenHash: string; expiresAt: string;companyIds:string[] }) => ({ id: 'invite-1', email: input.email, role: input.role, expiresAt: input.expiresAt,companyIds:input.companyIds,companyNames:['Company A'] }),
  revokeFirmInvitation:async()=>{},
  requestFirmSeatLimit:async(_user:typeof user,_firmId:string,requestedSeatLimit:number)=>({id:'seat-change-1',currentSeatLimit:2,requestedSeatLimit,status:'pending' as const,createdAt:'2026-08-30T12:00:00Z'}),
  acceptFirmInvitation: async () => ({ firmId: '2d1e70b2-b680-4138-a865-f35f3f20c626', role: 'accountant' as const }),
  suspendFirmMembership: async () => {},
  setFirmMemberCompanyAccess:async()=>{},
  getFirmSubscription: async () => ({
    planCode: 'accounting' as const, displayName: 'Apex Ledger Accounting', status: 'active' as const,
    hasPayrollHistory: false, currentPeriodStart: null, currentPeriodEnd: null, version: 1,
    workspaceType: 'cpa_firm' as const, role: 'owner' as const,
  }),
  listAccounts: async () => [],
  createEmailMfaChallenge:async()=> '5a75a84d-7d3e-46d8-9f5f-cb8bb4fb9dbe',
  consumeEmailMfaChallenge:async()=>true,
  getPlatformRole:async()=>null,
  listPlatformSubscriptions:async()=>[],
  listPlatformSubscriptionActions:async()=>[],
  managePlatformSubscription:async()=>{},
  createAccount: async (_user: typeof user, _firmId: string, _companyId: string, input: { name: string; internalCode?: string; accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'; accountKind: string; parentAccountId?: string; isMaster?: boolean }) => ({
    id: '2bc83b7e-c9e7-46c4-9e7c-910727c3455f', name: input.name, internalCode: input.internalCode ?? null,
    accountType: input.accountType, accountKind: input.accountKind, parentAccountId: input.parentAccountId ?? null,
    isMaster: input.isMaster ?? false, active: true, version: 1,
  }),
  createAndPostJournal: async () => ({
    id: '973a7ca4-c3fa-49ca-a873-9097bcb37d23', transactionDate: '2026-08-29', reference: null,
    memo: 'Test', status: 'posted' as const, version: 2, debitCents: '100', creditCents: '100',
  }),
  generalLedger: async () => [],
  createBusinessTransaction: async () => ({
    id: '9974a3b5-c696-4e38-aada-e362283c7987', transactionType: 'sale' as const,
    transactionDate: '2026-08-29', description: 'Sale', counterpartyName: null,
    taxCode: 'hst_13' as const, baseCents: '10000', hstCents: '1300', totalCents: '11300',
    journalEntryId: '973a7ca4-c3fa-49ca-a873-9097bcb37d23', createdAt: '2026-08-29T12:00:00Z',
  }),
  listBusinessTransactions: async () => [],
  salesTaxSummary: async () => ({
    salesBaseCents: '0', hstCollectedCents: '0', expenseBaseCents: '0', itcPaidCents: '0', netHstPayableCents: '0',
  }),
  salesTaxCategorySummary: async()=>[],
  listCompanyContacts: async () => [],
  createCompanyContact: async (_user: AuthenticatedUser, _firmId: string, _companyId: string, input: { contactType: 'customer' | 'vendor' | 'both'; entityType: 'business' | 'person'; displayName: string; sinLastFour?: string }) => ({
    id: 'bfcfa66d-2886-4f5b-b70e-2b36143f3203', contactType: input.contactType, entityType: input.entityType,
    displayName: input.displayName, companyName: null, firstName: null, lastName: null, email: null, phone: null,
    addressLine1: null, addressLine2: null, city: null, province: null, postalCode: null, dateOfBirth: null,
    sinLastFour: input.sinLastFour ?? null, hasSin: Boolean(input.sinLastFour), notes: null, version: 1,
  }),
  listProductsServices: async () => [],
  createProductService: async () => ({ id:'ca808414-f9f6-4f6d-9532-405b84502ea1',itemType:'service' as const,name:'Consulting',description:null,sku:null,unitPriceCents:'10000',revenueAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',defaultTaxCode:'hst_13' as const,active:true,version:1 }),
  updateProductService: async () => ({ id:'ca808414-f9f6-4f6d-9532-405b84502ea1',itemType:'service' as const,name:'Consulting',description:null,sku:null,unitPriceCents:'10000',revenueAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',defaultTaxCode:'hst_13' as const,active:true,version:2 }),
  listSalesInvoices: async () => [],
  getSalesInvoice: async () => ({id:'2e692c86-af53-4939-a5f0-b1d8c65c0312',customerId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',customerName:'Client',invoiceNumber:'1',invoiceDate:'2026-08-29',dueDate:'2026-09-28',memo:null,status:'posted' as const,subtotalCents:'10000',hstCents:'1300',totalCents:'11300',balanceCents:'11300',journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',version:1,
    lines:[{id:'94a47013-c844-4ed6-a7a8-b04c3cf59ebd',lineNumber:1,productId:null,description:'Consulting',quantityMilli:'1000',unitPriceCents:'10000',revenueAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',taxCode:'hst_13' as const,baseCents:'10000',hstCents:'1300',totalCents:'11300'}]}),
  voidSalesInvoice: async () => ({id:'2e692c86-af53-4939-a5f0-b1d8c65c0312',customerId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',customerName:'Client',invoiceNumber:'1',invoiceDate:'2026-08-29',dueDate:'2026-09-28',memo:null,status:'voided' as const,subtotalCents:'10000',hstCents:'1300',totalCents:'11300',balanceCents:'0',journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',version:2}),
  createSalesInvoice: async () => ({id:'2e692c86-af53-4939-a5f0-b1d8c65c0312',customerId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',customerName:'Client',invoiceNumber:'1',invoiceDate:'2026-08-29',dueDate:'2026-09-28',memo:null,status:'posted' as const,subtotalCents:'10000',hstCents:'1300',totalCents:'11300',balanceCents:'11300',journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',version:1}),
  createCustomerPayment: async () => ({id:'6bcae948-8f96-4c78-b0d6-d2cdfeb06e2e',invoiceId:'2e692c86-af53-4939-a5f0-b1d8c65c0312',paymentDate:'2026-08-29',amountCents:'11300',bankAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',reference:null,journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',createdAt:'2026-08-29T12:00:00Z'}),
  listVendorBills:async()=>[],
  createVendorBill:async()=>({id:'675f3fbb-96be-48b9-9f35-e20c6971125c',vendorId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',vendorName:'Vendor',billNumber:'1',vendorInvoiceNumber:'INV-12345',billDate:'2026-08-30',dueDate:'2026-09-29',memo:null,status:'posted' as const,subtotalCents:'157500',hstCents:'20475',totalCents:'177975',balanceCents:'177975',journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',version:1}),
  getVendorBill:async()=>({id:'675f3fbb-96be-48b9-9f35-e20c6971125c',vendorId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',vendorName:'Vendor',billNumber:'1',vendorInvoiceNumber:'INV-12345',billDate:'2026-08-30',dueDate:'2026-09-29',memo:null,status:'posted' as const,subtotalCents:'157500',hstCents:'20475',totalCents:'177975',balanceCents:'177975',journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',version:1,
    lines:[{id:'94a47013-c844-4ed6-a7a8-b04c3cf59ebd',lineNumber:1,description:'Office supplies',expenseAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',taxCode:'hst_13' as const,baseCents:'157500',hstCents:'20475',totalCents:'177975'}]}),
  createVendorPayment:async()=>({id:'6bcae948-8f96-4c78-b0d6-d2cdfeb06e2e',billId:'675f3fbb-96be-48b9-9f35-e20c6971125c',paymentDate:'2026-08-30',amountCents:'177975',bankAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',reference:null,journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',createdAt:'2026-08-30T12:00:00Z'}),
  voidVendorBill:async()=>({id:'675f3fbb-96be-48b9-9f35-e20c6971125c',vendorId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',vendorName:'Vendor',billNumber:'1',vendorInvoiceNumber:'INV-12345',billDate:'2026-08-30',dueDate:'2026-09-29',memo:null,status:'voided' as const,subtotalCents:'157500',hstCents:'20475',totalCents:'177975',balanceCents:'0',journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',version:2}),
  createBankTransfer:async()=>({id:'8d83acaa-d54b-442e-8c53-44a6c012002b',transferDate:'2026-08-30',fromAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',fromAccountName:'Checking',toAccountId:'9bbaf352-720e-420c-93ef-672f5cc7cb84',toAccountName:'Savings',amountCents:'250000',memo:null,journalEntryId:'973a7ca4-c3fa-49ca-a873-9097bcb37d23',createdAt:'2026-08-30T12:00:00Z'}),
  createBankCsvImport:async()=>({id:'7d83acaa-d54b-442e-8c53-44a6c012002b',accountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',sourceName:'statement.csv',rowCount:2,importedRowCount:2,duplicateRowCount:0,createdAt:'2026-08-30T12:00:00Z'}),
  listBankImportRows:async()=>[],
};

describe('tenant API boundary', () => {
  it('does not require authentication for health checks', async () => {
    const app = buildApp({ config, verifyToken: async () => user, database });
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().stage, 'identity-and-tenancy');
    await app.close();
  });

  it('sends an email challenge without returning the security code',async()=>{let delivered='';const securedConfig={...config,MFA_REQUIRED:true};const app=buildApp({config:securedConfig,verifyToken:async()=>user,database,
    emailSender:{sendSecurityCode:async(input)=>{delivered=input.code;}}});const response=await app.inject({method:'POST',url:'/v1/auth/email-2fa/challenge',headers:{authorization:'Bearer test'}});
    assert.equal(response.statusCode,201);assert.match(delivered,/^[0-9]{6}$/);assert.equal(JSON.stringify(response.json()).includes(delivered),false);await app.close();});

  it('requires a verified second-factor session on protected API routes',async()=>{const app=buildApp({config:{...config,MFA_REQUIRED:true},verifyToken:async()=>user,database});
    const response=await app.inject({method:'GET',url:'/v1/me/firms',headers:{authorization:'Bearer test'}});
    assert.equal(response.statusCode,401);assert.equal(response.json().error,'mfa_required');await app.close();});

  it('returns read-only platform subscription action history to authorized staff',async()=>{const app=buildApp({config,verifyToken:async()=>user,database:{...database,listPlatformSubscriptionActions:async()=>[{id:'1',firmId:'10000000-0000-4000-8000-000000000001',firmName:'Firm A',actorName:'Support User',actorEmail:'support@example.test',action:'suspend',reason:'Customer requested stop',createdAt:'2026-08-31T12:00:00Z'}]}});
    const response=await app.inject({method:'GET',url:'/v1/platform/subscription-actions',headers:{authorization:'Bearer test'}});
    assert.equal(response.statusCode,200);assert.equal(response.json().actions[0].reason,'Customer requested stop');await app.close();});

  it('rejects unauthenticated firm access', async () => {
    const app = buildApp({ config, verifyToken: async () => { throw new Error('missing'); }, database });
    const response = await app.inject({ method: 'GET', url: '/v1/me/firms' });
    assert.equal(response.statusCode, 401);
    await app.close();
  });

  it('does not reveal companies from a firm without membership', async () => {
    const app = buildApp({ config, verifyToken: async () => user, database: { ...database,
      listFirmCompanies: async () => { throw new TenantAccessDeniedError(); },
    } });
    const response = await app.inject({ method: 'GET', url: '/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/companies', headers: { authorization: 'Bearer test' } });
    assert.equal(response.statusCode, 403);
    await app.close();
  });

  it('does not misreport database failures as authentication failures', async () => {
    const app = buildApp({ config, verifyToken: async () => user, database: { ...database,
      listUserFirms: async () => { throw new Error('database unavailable'); },
    } });
    const response = await app.inject({ method: 'GET', url: '/v1/me/firms', headers: { authorization: 'Bearer test' } });
    assert.equal(response.statusCode, 500);
    await app.close();
  });

  it('allows CORS only for configured browser origins', async () => {
    const corsConfig = { ...config, ALLOWED_ORIGINS: 'https://ledger.example' };
    const app = buildApp({ config: corsConfig, verifyToken: async () => user, database });
    const allowed = await app.inject({ method: 'OPTIONS', url: '/v1/me/firms', headers: { origin: 'https://ledger.example' } });
    const denied = await app.inject({ method: 'OPTIONS', url: '/v1/me/firms', headers: { origin: 'https://attacker.example' } });
    assert.equal(allowed.statusCode, 204);
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://ledger.example');
    assert.equal(denied.statusCode, 403);
    await app.close();
  });

  it('reports not-ready when PostgreSQL is unavailable', async () => {
    const app = buildApp({ config, verifyToken: async () => user, database: { ...database,
      ping: async () => { throw new Error('offline'); },
    } });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(response.statusCode, 503);
    await app.close();
  });

  it('creates a one-time seat invitation without returning its stored hash', async () => {
    const app = buildApp({ config, verifyToken: async () => user, database });
    const response = await app.inject({
      method: 'POST', url: '/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/invitations',
      headers:{authorization:'Bearer test'},body:{email:'new@example.com',role:'accountant',companyIds:['66c7ac08-fb9a-4b21-bc2b-39fa1f2417cb']},
    });
    assert.equal(response.statusCode, 201);
    assert.match(response.json().acceptUrl, /#invite=/);
    assert.equal('tokenHash' in response.json().invitation, false);
    await app.close();
  });

  it('records a future seat-limit increase without changing current access',async()=>{
    let requested=0;const app=buildApp({config,verifyToken:async()=>user,database:{...database,requestFirmSeatLimit:async(_user,_firmId,limit)=>{requested=limit;return database.requestFirmSeatLimit(user,_firmId,limit);}}});
    const response=await app.inject({method:'POST',url:'/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/seat-change-requests',headers:{authorization:'Bearer test'},body:{requestedSeatLimit:20}});
    assert.equal(response.statusCode,201);assert.equal(requested,20);assert.equal(response.json().request.status,'pending');await app.close();
  });

  it('returns payroll-disabled entitlements for the Accounting subscription', async () => {
    const app = buildApp({ config, verifyToken: async () => user, database });
    const response = await app.inject({
      method: 'GET', url: '/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/subscription',
      headers: { authorization: 'Bearer test' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().entitlements.accountingWrite, true);
    assert.equal(response.json().entitlements.payrollWrite, false);
    await app.close();
  });

  it('never passes a raw SIN to contact persistence or returns it in the response', async () => {
    let persisted: Record<string, unknown> | undefined;
    const app = buildApp({ config, verifyToken: async () => user, database: { ...database,
      createCompanyContact: async (_user, _firmId, _companyId, input) => {
        persisted = input as unknown as Record<string, unknown>;
        return database.createCompanyContact(_user, _firmId, _companyId, input);
      },
    } });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/companies/66c7ac08-fb9a-4b21-bc2b-39fa1f2417cb/contacts',
      headers: { authorization: 'Bearer test' },
      body: { contactType: 'customer', entityType: 'person', displayName: 'Protected Client', sin: '046 454 286' },
    });
    assert.equal(response.statusCode, 201);
    assert.equal('sin' in (persisted ?? {}), false);
    assert.equal(typeof persisted?.sinLookupHash, 'string');
    assert.equal(JSON.stringify(response.json()).includes('046454286'), false);
    assert.equal(response.json().contact.sinLastFour, '4286');
    await app.close();
  });

  it('calculates invoice quantity and HST before the atomic persistence call', async () => {
    let captured: { calculated?: { subtotalCents: number; hstCents: number; totalCents: number } } | undefined;
    const app=buildApp({config,verifyToken:async()=>user,database:{...database,
      createSalesInvoice:async(_user,_firmId,_companyId,_key,_hash,input)=>{captured=input;return database.createSalesInvoice();},
    }});
    const response=await app.inject({method:'POST',url:'/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/companies/66c7ac08-fb9a-4b21-bc2b-39fa1f2417cb/sales-invoices',
      headers:{authorization:'Bearer test','idempotency-key':'invoice-request-0001'},body:{customerId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',invoiceDate:'2026-08-29',dueDate:'2026-09-28',
        lines:[{description:'Plastic Glass',quantityMilli:5000,unitPriceCents:4500,revenueAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',taxCode:'hst_13'}]}});
    assert.equal(response.statusCode,201);assert.deepEqual(captured?.calculated&&{
      subtotalCents:captured.calculated.subtotalCents,hstCents:captured.calculated.hstCents,totalCents:captured.calculated.totalCents,
    },{subtotalCents:22500,hstCents:2925,totalCents:25425});
    await app.close();
  });

  it('rejects an invoice due date before its invoice date',async()=>{
    const app=buildApp({config,verifyToken:async()=>user,database});
    const response=await app.inject({method:'POST',url:'/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/companies/66c7ac08-fb9a-4b21-bc2b-39fa1f2417cb/sales-invoices',
      headers:{authorization:'Bearer test','idempotency-key':'invoice-request-0002'},body:{customerId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',invoiceDate:'2026-08-29',dueDate:'2026-08-28',
        lines:[{description:'Service',quantityMilli:1000,unitPriceCents:10000,revenueAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',taxCode:'hst_13'}]}});
    assert.equal(response.statusCode,400);assert.equal(response.json().error,'due_date_before_invoice_date');await app.close();
  });

  it('calculates vendor-bill HST before posting Accounts Payable',async()=>{
    let captured:{calculated?:{subtotalCents:number;hstCents:number;totalCents:number}}|undefined;
    const app=buildApp({config,verifyToken:async()=>user,database:{...database,
      createVendorBill:async(_user,_firmId,_companyId,_key,_hash,input)=>{captured=input;return database.createVendorBill();},
    }});
    const response=await app.inject({method:'POST',url:'/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/companies/66c7ac08-fb9a-4b21-bc2b-39fa1f2417cb/vendor-bills',
      headers:{authorization:'Bearer test','idempotency-key':'vendor-bill-request-0001'},body:{vendorId:'bfcfa66d-2886-4f5b-b70e-2b36143f3203',vendorInvoiceNumber:'inv-12345',billDate:'2026-08-30',dueDate:'2026-09-29',
        lines:[{description:'Office supplies',expenseAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',taxCode:'hst_13',baseCents:157500}]}});
    assert.equal(response.statusCode,201);assert.deepEqual(captured?.calculated&&{subtotalCents:captured.calculated.subtotalCents,hstCents:captured.calculated.hstCents,totalCents:captured.calculated.totalCents},
      {subtotalCents:157500,hstCents:20475,totalCents:177975});await app.close();
  });

  it('posts a validated bank transfer through the dedicated endpoint',async()=>{let amount=0;const app=buildApp({config,verifyToken:async()=>user,database:{...database,
    createBankTransfer:async(_user,_firmId,_companyId,_key,_hash,input)=>{amount=input.amountCents;return database.createBankTransfer();}}});
    const response=await app.inject({method:'POST',url:'/v1/firms/2d1e70b2-b680-4138-a865-f35f3f20c626/companies/66c7ac08-fb9a-4b21-bc2b-39fa1f2417cb/bank-transfers',
      headers:{authorization:'Bearer test','idempotency-key':'bank-transfer-request-0001'},body:{transferDate:'2026-08-30',fromAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',toAccountId:'9bbaf352-720e-420c-93ef-672f5cc7cb84',amountCents:250000}});
    assert.equal(response.statusCode,201);assert.equal(amount,250000);await app.close();});
});
