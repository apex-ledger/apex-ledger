import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthenticatedUser, TokenVerifier } from './auth.js';
import type { AppConfig } from './config.js';
import {
  IdempotencyConflictError, IdempotencyInProgressError, InvitationEmailRequiredError,
  BusinessTransactionAccountError, SubscriptionAccessDeniedError, SubscriptionReadOnlyError,
  SalesInvoiceAccountError, SalesInvoiceCustomerError, SalesInvoiceProductError,
  CustomerPaymentAllocationError,
  ProductVersionConflictError,
  InvoiceVoidConflictError, SalesInvoiceNotFoundError,
  VendorBillAccountError, VendorBillNotFoundError, VendorBillVendorError, VendorBillVoidConflictError, VendorPaymentAllocationError,
  BankTransferAccountError,
  TenantAccessDeniedError, type TenantDatabase,
} from './db.js';
import { createSeatInvitationSecret, hashSeatInvitationToken } from './seatInvitation.js';
import { deriveSubscriptionEntitlements } from './subscriptionEntitlements.js';
import { deriveUserCapabilities } from './userCapabilities.js';
import { hashJournalRequest, JournalValidationError, validateJournalPost, type JournalPostInput } from './journalValidation.js';
import { calculateHst, hashBusinessTransactionRequest, HstCalculationError, suggestHstCode, type HstCode } from './hstCalculation.js';
import { ContactPrivacyError, hashCanadianSin, looksLikeSinSearch } from './contactPrivacy.js';
import { calculateSalesInvoice, hashSalesInvoiceRequest, SalesInvoiceCalculationError, type SalesInvoiceLineInput } from './salesInvoiceCalculation.js';
import { CustomerPaymentValidationError, hashCustomerPaymentRequest, validateCustomerPayment } from './customerPayment.js';
import { hashInvoiceVoidRequest, InvoiceVoidValidationError, validateInvoiceVoid } from './invoiceVoid.js';
import { calculateVendorBill,hashVendorBillRequest,VendorBillCalculationError,type VendorBillLineInput } from './vendorBillCalculation.js';
import { hashVendorPaymentRequest,validateVendorPayment,VendorPaymentValidationError } from './vendorPayment.js';
import{BankTransferValidationError,hashBankTransferRequest,validateBankTransfer}from'./bankTransfer.js';
import{BankImportValidationError,parseBankCsv}from'./bankImport.js';
import{createEmailOtp,hashEmailOtp,issueMfaSession,maskEmail,verifyMfaSession}from'./mfa.js';
import type{EmailSender}from'./email.js';
import{inspectBankCsvUpload,UnsafeUploadError}from'./uploadSecurity.js';

export interface AppDependencies {
  config: AppConfig;
  verifyToken: TokenVerifier;
  database: Pick<TenantDatabase,
    'ping' | 'listUserFirms' | 'listFirmCompanies' | 'listFirmSeats' |
    'createFirmInvitation' | 'revokeFirmInvitation' | 'requestFirmSeatLimit' | 'acceptFirmInvitation' | 'suspendFirmMembership' | 'setFirmMemberCompanyAccess' | 'getFirmSubscription' |
    'listAccounts' | 'createAccount' | 'createAndPostJournal' | 'generalLedger' |
    'createBusinessTransaction' | 'listBusinessTransactions' | 'salesTaxSummary' | 'salesTaxCategorySummary' |
    'listCompanyContacts' | 'createCompanyContact' | 'listProductsServices' | 'createProductService' | 'updateProductService' |
    'createSalesInvoice' | 'listSalesInvoices' | 'getSalesInvoice' | 'voidSalesInvoice' | 'createCustomerPayment' |
    'createVendorBill' | 'listVendorBills' | 'getVendorBill' | 'createVendorPayment' | 'voidVendorBill' | 'createBankTransfer' | 'createBankCsvImport' | 'listBankImportRows' |
    'createEmailMfaChallenge'|'consumeEmailMfaChallenge'|'getPlatformRole'|'listPlatformSubscriptions'|'listPlatformSubscriptionActions'|'managePlatformSubscription'>;
  emailSender?:EmailSender;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const allowedOrigins = new Set(
    dependencies.config.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean),
  );
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id',
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    return payload;
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-headers', 'Authorization, Content-Type, Idempotency-Key, X-Request-Id, X-Apex-2FA');
      reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) return reply.code(403).send({ error: 'origin_not_allowed' });
      return reply.code(204).send();
    }
  });

  app.addHook('onRequest',async(request,reply)=>{if(!dependencies.config.MFA_REQUIRED||!request.url.startsWith('/v1/')||request.url.startsWith('/v1/auth/email-2fa/'))return;
    let user:AuthenticatedUser;try{user=await dependencies.verifyToken(request.headers.authorization);}catch{return reply.code(401).send({error:'unauthorized'});}
    const token=typeof request.headers['x-apex-2fa']==='string'?request.headers['x-apex-2fa']:undefined;
    if(!await verifyMfaSession(dependencies.config.MFA_HMAC_SECRET,token,user.objectId))return reply.code(401).send({error:'mfa_required'});
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'apexledger-cloud-api',
    stage: 'identity-and-tenancy',
    version: dependencies.config.APP_VERSION,
    region: dependencies.config.AZURE_REGION,
  }));

  app.get('/ready', async (_request, reply) => {
    try {
      await dependencies.database.ping();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  app.post('/v1/auth/email-2fa/challenge',async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    if(!dependencies.config.MFA_REQUIRED)return{required:false};if(!user.email)return reply.code(400).send({error:'verified_email_required'});
    const code=createEmailOtp();const codeHash=hashEmailOtp(dependencies.config.MFA_HMAC_SECRET,user.objectId,code);const expiresAt=new Date(Date.now()+10*60_000).toISOString();
    try{const challengeId=await dependencies.database.createEmailMfaChallenge(user,codeHash,expiresAt);if(!dependencies.emailSender)throw new Error('email_delivery_not_configured');
      await dependencies.emailSender.sendSecurityCode({to:user.email,code,expiresMinutes:10});return reply.code(201).send({required:true,challengeId,destination:maskEmail(user.email),expiresAt});
    }catch(error){if(error instanceof Error&&error.message.includes('rate limited'))return reply.code(429).send({error:'mfa_challenge_rate_limited'});request.log.error({error},'MFA challenge delivery failed');return reply.code(503).send({error:'mfa_delivery_unavailable'});}});

  app.post<{Body:{challengeId:string;code:string}}>('/v1/auth/email-2fa/verify',{schema:{body:{type:'object',additionalProperties:false,required:['challengeId','code'],properties:{challengeId:{type:'string',format:'uuid'},code:{type:'string',pattern:'^[0-9]{6}$'}}}}},
    async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;const codeHash=hashEmailOtp(dependencies.config.MFA_HMAC_SECRET,user.objectId,request.body.code);
      try{if(!await dependencies.database.consumeEmailMfaChallenge(user,request.body.challengeId,codeHash))return reply.code(400).send({error:'mfa_code_invalid_or_expired'});return{sessionToken:await issueMfaSession(dependencies.config.MFA_HMAC_SECRET,user.objectId),expiresInSeconds:28_800};}
      catch(error){request.log.error({error},'MFA verification failed');return reply.code(400).send({error:'mfa_code_invalid_or_expired'});}});

  app.get('/v1/platform/me',async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;return{role:await dependencies.database.getPlatformRole(user)};});
  app.get('/v1/platform/subscriptions',async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;try{return{subscriptions:await dependencies.database.listPlatformSubscriptions(user)};}
    catch{return reply.code(403).send({error:'platform_access_denied'});}});
  app.get('/v1/platform/subscription-actions',async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;try{return{actions:await dependencies.database.listPlatformSubscriptionActions(user,100)};}
    catch{return reply.code(403).send({error:'platform_access_denied'});}});
  app.patch<{Params:{firmId:string};Body:{planCode:'essentials'|'accounting'|'accounting_payroll';status:'trialing'|'active'|'past_due'|'suspended'|'canceled';periodEnd:string|null;action:'renew'|'suspend'|'reactivate'|'mark_past_due'|'cancel'|'change_plan';reason:string}}>(
    '/v1/platform/subscriptions/:firmId',{schema:{params:uuidFirmParamsSchema,body:{type:'object',additionalProperties:false,required:['planCode','status','periodEnd','action','reason'],properties:{planCode:{type:'string',enum:['essentials','accounting','accounting_payroll']},status:{type:'string',enum:['trialing','active','past_due','suspended','canceled']},periodEnd:{anyOf:[{type:'string',format:'date-time'},{type:'null'}]},action:{type:'string',enum:['renew','suspend','reactivate','mark_past_due','cancel','change_plan']},reason:{type:'string',minLength:3,maxLength:500}}}}},
      async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;try{await dependencies.database.managePlatformSubscription(user,request.params.firmId,request.body);return reply.code(204).send();}
        catch(error){request.log.warn({error},'platform subscription action denied');return reply.code(403).send({error:'platform_action_denied'});}});

  app.get('/v1/me/firms', async (request, reply) => {
    let user: AuthenticatedUser;
    try {
      user = await dependencies.verifyToken(request.headers.authorization);
    } catch (error) {
      request.log.warn({ error }, 'token rejected');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    try {
      return { firms: await dependencies.database.listUserFirms(user) };
    } catch (error) {
      request.log.error({ error }, 'firm listing failed');
      return reply.code(500).send({ error: 'service_unavailable' });
    }
  });

  app.get<{ Params: { firmId: string } }>('/v1/firms/:firmId/companies', {
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['firmId'],
        properties: { firmId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    let user: AuthenticatedUser;
    try {
      user = await dependencies.verifyToken(request.headers.authorization);
    } catch (error) {
      request.log.warn({ error }, 'token rejected');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    try {
      return { companies: await dependencies.database.listFirmCompanies(user, request.params.firmId) };
    } catch (error) {
      if (error instanceof TenantAccessDeniedError) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      request.log.error({ error }, 'company listing failed');
      return reply.code(500).send({ error: 'service_unavailable' });
    }
  });

  app.get<{ Params: { firmId: string } }>('/v1/firms/:firmId/seats', {
    schema: { params: uuidFirmParamsSchema },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      return await dependencies.database.listFirmSeats(user, request.params.firmId);
    } catch (error) {
      if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ error: 'forbidden' });
      request.log.error({ error }, 'seat listing failed');
      return reply.code(500).send({ error: 'service_unavailable' });
    }
  });

  app.get<{ Params: { firmId: string } }>('/v1/firms/:firmId/subscription', {
    schema: { params: uuidFirmParamsSchema },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      const subscription = await dependencies.database.getFirmSubscription(user, request.params.firmId);
      const entitlements = deriveSubscriptionEntitlements(
        subscription.planCode, subscription.status, subscription.hasPayrollHistory,
      );
      return {
        subscription,
        entitlements,
        capabilities: deriveUserCapabilities(entitlements, subscription.role, subscription.workspaceType),
      };
    } catch (error) {
      if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ error: 'forbidden' });
      request.log.error({ error }, 'subscription lookup failed');
      return reply.code(500).send({ error: 'service_unavailable' });
    }
  });

  app.post<{ Params: { firmId: string }; Body: { email: string; role: 'firm_admin' | 'accountant' | 'bookkeeper' | 'payroll' | 'viewer';companyIds:string[] } }>(
    '/v1/firms/:firmId/invitations',
    {
      schema: {
        params: uuidFirmParamsSchema,
        body: {
          type: 'object', additionalProperties: false, required: ['email', 'role','companyIds'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 320 },
            role: { type: 'string', enum: ['firm_admin', 'accountant', 'bookkeeper', 'payroll', 'viewer'] },
            companyIds:{type:'array',maxItems:10000,uniqueItems:true,items:{type:'string',format:'uuid'}},
          },
        },
      },
    },
    async (request, reply) => {
      const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
      if (!user) return;
      const secret = createSeatInvitationSecret(dependencies.config.INVITATION_BASE_URL);
      try {
        const invitation = await dependencies.database.createFirmInvitation(user, request.params.firmId, {
          email: request.body.email, role: request.body.role,
          tokenHash: secret.tokenHash, expiresAt: secret.expiresAt,companyIds:request.body.companyIds,
        });
        return reply.code(201).send({
          invitation,
          acceptUrl: secret.acceptUrl,
        });
      } catch (error) {
        if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ error: 'forbidden' });
        if (databaseErrorCode(error) === '23514') return reply.code(409).send({ error: 'seat_limit_reached' });
        if (databaseErrorCode(error) === '23505') return reply.code(409).send({ error: 'invitation_exists' });
        if(error instanceof Error&&error.message==='company_access_required')return reply.code(400).send({error:'company_access_required'});
        request.log.error({ error }, 'invitation creation failed');
        return reply.code(500).send({ error: 'service_unavailable' });
      }
    },
  );

  app.post<{ Body: { token: string } }>('/v1/invitations/accept', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['token'],
        properties: { token: { type: 'string', minLength: 40, maxLength: 100 } },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    const tokenHash = hashSeatInvitationToken(request.body.token);
    try {
      return { membership: await dependencies.database.acceptFirmInvitation(user, tokenHash) };
    } catch (error) {
      if (error instanceof InvitationEmailRequiredError) {
        return reply.code(400).send({ error: 'verified_email_required' });
      }
      return reply.code(400).send({ error: 'invitation_invalid_or_expired' });
    }
  });

  app.delete<{Params:{firmId:string;invitationId:string}}>('/v1/firms/:firmId/invitations/:invitationId',{schema:{params:{type:'object',additionalProperties:false,required:['firmId','invitationId'],
    properties:{firmId:{type:'string',format:'uuid'},invitationId:{type:'string',format:'uuid'}}}}},async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    try{await dependencies.database.revokeFirmInvitation(user,request.params.firmId,request.params.invitationId);return reply.code(204).send();}catch(error){request.log.warn({error},'invitation revocation rejected');return reply.code(409).send({error:'invitation_revocation_rejected'});}});

  app.post<{Params:{firmId:string};Body:{requestedSeatLimit:number}}>('/v1/firms/:firmId/seat-change-requests',{schema:{params:uuidFirmParamsSchema,body:{type:'object',additionalProperties:false,required:['requestedSeatLimit'],
    properties:{requestedSeatLimit:{type:'integer',minimum:2,maximum:10000}}}}},async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    try{return reply.code(201).send({request:await dependencies.database.requestFirmSeatLimit(user,request.params.firmId,request.body.requestedSeatLimit)});}catch(error){if(error instanceof TenantAccessDeniedError)return reply.code(403).send({error:'forbidden'});
      if(databaseErrorCode(error)==='23505')return reply.code(409).send({error:'seat_change_already_pending'});if(error instanceof Error&&error.message==='invalid_seat_limit')return reply.code(400).send({error:'invalid_seat_limit'});
      request.log.error({error},'seat increase request failed');return reply.code(500).send({error:'service_unavailable'});}});

  app.delete<{ Params: { firmId: string; userId: string } }>('/v1/firms/:firmId/members/:userId', {
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['firmId', 'userId'],
        properties: { firmId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      await dependencies.database.suspendFirmMembership(user, request.params.firmId, request.params.userId);
      return reply.code(204).send();
    } catch (error) {
      request.log.warn({ error }, 'seat suspension rejected');
      return reply.code(409).send({ error: 'seat_suspension_rejected' });
    }
  });

  app.put<{Params:{firmId:string;userId:string};Body:{companyIds:string[]}}>('/v1/firms/:firmId/members/:userId/company-access',{schema:{params:{type:'object',additionalProperties:false,required:['firmId','userId'],properties:{firmId:{type:'string',format:'uuid'},userId:{type:'string',format:'uuid'}}},
    body:{type:'object',additionalProperties:false,required:['companyIds'],properties:{companyIds:{type:'array',minItems:1,maxItems:10000,uniqueItems:true,items:{type:'string',format:'uuid'}}}}}},async(request,reply)=>{
    const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;try{await dependencies.database.setFirmMemberCompanyAccess(user,request.params.firmId,request.params.userId,request.body.companyIds);return reply.code(204).send();}
    catch(error){if(error instanceof TenantAccessDeniedError)return reply.code(403).send({error:'forbidden'});return reply.code(409).send({error:'company_access_update_rejected'});}});

  app.get<{ Params: { firmId: string; companyId: string } }>(
    '/v1/firms/:firmId/companies/:companyId/accounts',
    { schema: { params: firmCompanyParamsSchema } },
    async (request, reply) => {
      const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
      if (!user) return;
      try {
        return { accounts: await dependencies.database.listAccounts(user, request.params.firmId, request.params.companyId) };
      } catch (error) {
        return sendAccountingAccessError(error, reply, request.log);
      }
    },
  );

  app.post<{
    Params: { firmId: string; companyId: string };
    Body: { name: string; internalCode?: string; accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'; accountKind: string; parentAccountId?: string; isMaster?: boolean };
  }>('/v1/firms/:firmId/companies/:companyId/accounts', {
    schema: {
      params: firmCompanyParamsSchema,
      body: {
        type: 'object', additionalProperties: false, required: ['name', 'accountType', 'accountKind'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          internalCode: { type: 'string', maxLength: 50 },
          accountType: { type: 'string', enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] },
          accountKind: { type: 'string', minLength: 1, maxLength: 100 },
          parentAccountId: { type: 'string', format: 'uuid' },
          isMaster: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      const account = await dependencies.database.createAccount(user, request.params.firmId, request.params.companyId, request.body);
      return reply.code(201).send({ account });
    } catch (error) {
      if (databaseErrorCode(error) === '23505') return reply.code(409).send({ error: 'account_already_exists' });
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.get<{Params:{firmId:string;companyId:string;invoiceId:string}}>(
    '/v1/firms/:firmId/companies/:companyId/sales-invoices/:invoiceId',{schema:{params:firmCompanyInvoiceParamsSchema}},async(request,reply)=>{
      const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
      try{return{invoice:await dependencies.database.getSalesInvoice(user,request.params.firmId,request.params.companyId,request.params.invoiceId)};}
      catch(error){if(error instanceof SalesInvoiceNotFoundError)return reply.code(404).send({error:error.message});return sendAccountingAccessError(error,reply,request.log);}
    });

  app.post<{Params:{firmId:string;companyId:string;invoiceId:string};Headers:{'idempotency-key'?:string};Body:{voidDate:string;reason:string}}>(
    '/v1/firms/:firmId/companies/:companyId/sales-invoices/:invoiceId/void',{
      schema:{params:firmCompanyInvoiceParamsSchema,headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',minLength:16,maxLength:200}}},
        body:{type:'object',additionalProperties:false,required:['voidDate','reason'],properties:{voidDate:{type:'string',format:'date'},reason:{type:'string',minLength:3,maxLength:500}}}},
    },async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
      try{validateInvoiceVoid(request.body);const requestHash=hashInvoiceVoidRequest(request.params.companyId,request.params.invoiceId,request.body);
        return{invoice:await dependencies.database.voidSalesInvoice(user,request.params.firmId,request.params.companyId,request.params.invoiceId,request.headers['idempotency-key']!,requestHash,request.body)};
      }catch(error){if(error instanceof InvoiceVoidValidationError)return reply.code(400).send({error:'invalid_invoice_void',message:error.message});
        if(error instanceof InvoiceVoidConflictError)return reply.code(409).send({error:error.message});
        if(error instanceof IdempotencyConflictError||error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});
        if(error instanceof Error&&error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});
        return sendAccountingAccessError(error,reply,request.log);}
    });

  app.patch<{
    Params:{firmId:string;companyId:string;productId:string};
    Body:{itemType:'product'|'service';name:string;description?:string;sku?:string;unitPriceCents:number;revenueAccountId:string;defaultTaxCode:HstCode;expectedVersion:number};
  }>('/v1/firms/:firmId/companies/:companyId/products-services/:productId',{
    schema:{params:firmCompanyProductParamsSchema,body:{type:'object',additionalProperties:false,
      required:['itemType','name','unitPriceCents','revenueAccountId','defaultTaxCode','expectedVersion'],properties:{
        itemType:{type:'string',enum:['product','service']},name:{type:'string',minLength:1,maxLength:200},description:{type:'string',maxLength:500},sku:{type:'string',maxLength:100},
        unitPriceCents:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},revenueAccountId:{type:'string',format:'uuid'},defaultTaxCode:{type:'string',enum:['hst_13','hst_exempt','manual_hst']},
        expectedVersion:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},
      }}},
  },async(request,reply)=>{
    const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    try{return{product:await dependencies.database.updateProductService(user,request.params.firmId,request.params.companyId,request.params.productId,request.body)};}
    catch(error){if(error instanceof ProductVersionConflictError)return reply.code(409).send({error:error.message});
      if(error instanceof SalesInvoiceAccountError)return reply.code(400).send({error:error.message});
      if(databaseErrorCode(error)==='23505')return reply.code(409).send({error:'product_already_exists'});
      return sendAccountingAccessError(error,reply,request.log);}
  });

  app.get<{ Params: { firmId: string; companyId: string } }>(
    '/v1/firms/:firmId/companies/:companyId/products-services',
    { schema: { params: firmCompanyParamsSchema } },
    async (request, reply) => {
      const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply); if (!user) return;
      try { return { products: await dependencies.database.listProductsServices(user, request.params.firmId, request.params.companyId) }; }
      catch (error) { return sendAccountingAccessError(error, reply, request.log); }
    },
  );

  app.post<{
    Params: { firmId: string; companyId: string };
    Body: { itemType: 'product' | 'service'; name: string; description?: string; sku?: string; unitPriceCents: number; revenueAccountId: string; defaultTaxCode: HstCode };
  }>('/v1/firms/:firmId/companies/:companyId/products-services', {
    schema: { params: firmCompanyParamsSchema, body: {
      type: 'object', additionalProperties: false, required: ['itemType','name','unitPriceCents','revenueAccountId','defaultTaxCode'],
      properties: { itemType: { type:'string',enum:['product','service'] }, name:{type:'string',minLength:1,maxLength:200},
        description:{type:'string',maxLength:500}, sku:{type:'string',maxLength:100}, unitPriceCents:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
        revenueAccountId:{type:'string',format:'uuid'}, defaultTaxCode:{type:'string',enum:['hst_13','hst_exempt','manual_hst']} },
    } },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply); if (!user) return;
    try { return reply.code(201).send({ product: await dependencies.database.createProductService(user, request.params.firmId, request.params.companyId, request.body) }); }
    catch (error) {
      if (error instanceof SalesInvoiceAccountError) return reply.code(400).send({error:error.message});
      if (databaseErrorCode(error)==='23505') return reply.code(409).send({error:'product_already_exists'});
      return sendAccountingAccessError(error,reply,request.log);
    }
  });

  app.get<{ Params: { firmId: string; companyId: string } }>(
    '/v1/firms/:firmId/companies/:companyId/sales-invoices', { schema: { params: firmCompanyParamsSchema } },
    async (request, reply) => {
      const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply); if (!user) return;
      try { return { invoices: await dependencies.database.listSalesInvoices(user, request.params.firmId, request.params.companyId) }; }
      catch (error) { return sendAccountingAccessError(error,reply,request.log); }
    },
  );

  app.post<{
    Params:{firmId:string;companyId:string}; Headers:{'idempotency-key'?:string};
    Body:{customerId:string;invoiceDate:string;dueDate:string;memo?:string;lines:SalesInvoiceLineInput[]};
  }>('/v1/firms/:firmId/companies/:companyId/sales-invoices', {
    schema:{params:firmCompanyParamsSchema,headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',minLength:16,maxLength:200}}},
      body:{type:'object',additionalProperties:false,required:['customerId','invoiceDate','dueDate','lines'],properties:{
        customerId:{type:'string',format:'uuid'},invoiceDate:{type:'string',format:'date'},dueDate:{type:'string',format:'date'},memo:{type:'string',maxLength:500},
        lines:{type:'array',minItems:1,maxItems:500,items:{type:'object',additionalProperties:false,required:['description','quantityMilli','unitPriceCents','revenueAccountId','taxCode'],properties:{
          description:{type:'string',minLength:1,maxLength:500},quantityMilli:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},unitPriceCents:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
          revenueAccountId:{type:'string',format:'uuid'},productId:{type:'string',format:'uuid'},taxCode:{type:'string',enum:['hst_13','hst_exempt','manual_hst']},manualHstCents:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
        }}}
      }}
    }
  }, async(request,reply)=>{
    const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply); if(!user)return;
    if(request.body.dueDate<request.body.invoiceDate)return reply.code(400).send({error:'due_date_before_invoice_date'});
    try{
      const calculated=calculateSalesInvoice(request.body.lines);
      const requestHash=hashSalesInvoiceRequest(request.params.companyId,request.body);
      const invoice=await dependencies.database.createSalesInvoice(user,request.params.firmId,request.params.companyId,
        request.headers['idempotency-key']!,requestHash,{...request.body,calculated});
      return reply.code(201).send({invoice});
    }catch(error){
      if(error instanceof SalesInvoiceCalculationError || error instanceof HstCalculationError)return reply.code(400).send({error:'invalid_invoice',message:error.message});
      if(error instanceof SalesInvoiceAccountError || error instanceof SalesInvoiceCustomerError || error instanceof SalesInvoiceProductError)return reply.code(400).send({error:error.message});
      if(error instanceof IdempotencyConflictError || error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});
      if(error instanceof Error && error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});
      return sendAccountingAccessError(error,reply,request.log);
    }
  });

  app.post<{
    Params:{firmId:string;companyId:string;invoiceId:string};Headers:{'idempotency-key'?:string};
    Body:{paymentDate:string;amountCents:number;bankAccountId:string;reference?:string};
  }>('/v1/firms/:firmId/companies/:companyId/sales-invoices/:invoiceId/payments',{
    schema:{params:firmCompanyInvoiceParamsSchema,headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',minLength:16,maxLength:200}}},
      body:{type:'object',additionalProperties:false,required:['paymentDate','amountCents','bankAccountId'],properties:{paymentDate:{type:'string',format:'date'},
        amountCents:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},bankAccountId:{type:'string',format:'uuid'},reference:{type:'string',maxLength:100}}}},
  },async(request,reply)=>{
    const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    try{validateCustomerPayment(request.body);const requestHash=hashCustomerPaymentRequest(request.params.companyId,request.params.invoiceId,request.body);
      const payment=await dependencies.database.createCustomerPayment(user,request.params.firmId,request.params.companyId,request.params.invoiceId,
        request.headers['idempotency-key']!,requestHash,request.body);return reply.code(201).send({payment});
    }catch(error){
      if(error instanceof CustomerPaymentValidationError)return reply.code(400).send({error:'invalid_customer_payment',message:error.message});
      if(error instanceof CustomerPaymentAllocationError)return reply.code(409).send({error:error.message});
      if(error instanceof SalesInvoiceAccountError)return reply.code(400).send({error:error.message});
      if(error instanceof IdempotencyConflictError||error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});
      if(error instanceof Error&&error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});
      return sendAccountingAccessError(error,reply,request.log);
    }
  });

  app.get<{ Querystring: { description: string } }>('/v1/tax-suggestion', {
    schema: {
      querystring: {
        type: 'object', additionalProperties: false, required: ['description'],
        properties: { description: { type: 'string', minLength: 1, maxLength: 500 } },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    return { suggestion: suggestHstCode(request.query.description), requiresConfirmation: true };
  });

  app.get<{
    Params: { firmId: string; companyId: string };
    Querystring: { q?: string; contactType?: 'customer' | 'vendor' | 'both' };
  }>('/v1/firms/:firmId/companies/:companyId/contacts', {
    schema: {
      params: firmCompanyParamsSchema,
      querystring: {
        type: 'object', additionalProperties: false,
        properties: {
          q: { type: 'string', maxLength: 200 },
          contactType: { type: 'string', enum: ['customer', 'vendor', 'both'] },
        },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      const rawQuery = request.query.q?.trim() ?? '';
      const sinLookupHash = looksLikeSinSearch(rawQuery)
        ? hashCanadianSin(dependencies.config.CONTACT_SEARCH_HMAC_SECRET, rawQuery).lookupHash
        : undefined;
      return { contacts: await dependencies.database.listCompanyContacts(
        user, request.params.firmId, request.params.companyId,
        sinLookupHash ? '' : rawQuery, request.query.contactType, sinLookupHash,
      ) };
    } catch (error) {
      if (error instanceof ContactPrivacyError) return reply.code(400).send({ error: 'invalid_sin_search' });
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.post<{
    Params: { firmId: string; companyId: string };
    Body: {
      contactType: 'customer' | 'vendor' | 'both'; entityType: 'business' | 'person'; displayName: string;
      companyName?: string; firstName?: string; lastName?: string; email?: string; phone?: string;
      addressLine1?: string; addressLine2?: string; city?: string; province?: string; postalCode?: string;
      dateOfBirth?: string; sin?: string; notes?: string;
    };
  }>('/v1/firms/:firmId/companies/:companyId/contacts', {
    schema: {
      params: firmCompanyParamsSchema,
      body: {
        type: 'object', additionalProperties: false, required: ['contactType', 'entityType', 'displayName'],
        properties: {
          contactType: { type: 'string', enum: ['customer', 'vendor', 'both'] },
          entityType: { type: 'string', enum: ['business', 'person'] },
          displayName: { type: 'string', minLength: 1, maxLength: 200 },
          companyName: { type: 'string', maxLength: 200 },
          firstName: { type: 'string', maxLength: 100 }, lastName: { type: 'string', maxLength: 100 },
          email: { type: 'string', format: 'email', maxLength: 320 }, phone: { type: 'string', maxLength: 50 },
          addressLine1: { type: 'string', maxLength: 200 }, addressLine2: { type: 'string', maxLength: 200 },
          city: { type: 'string', maxLength: 100 }, province: { type: 'string', maxLength: 100 },
          postalCode: { type: 'string', maxLength: 20 }, dateOfBirth: { type: 'string', format: 'date' },
          sin: { type: 'string', minLength: 9, maxLength: 11 }, notes: { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      const protectedSin = request.body.sin
        ? hashCanadianSin(dependencies.config.CONTACT_SEARCH_HMAC_SECRET, request.body.sin)
        : undefined;
      const { sin: _sin, ...publicInput } = request.body;
      const contact = await dependencies.database.createCompanyContact(
        user, request.params.firmId, request.params.companyId,
        { ...publicInput, ...(protectedSin ? {
          sinLookupHash: protectedSin.lookupHash, sinLastFour: protectedSin.lastFour,
        } : {}) },
      );
      return reply.code(201).send({ contact });
    } catch (error) {
      if (error instanceof ContactPrivacyError) return reply.code(400).send({ error: 'invalid_sin', message: error.message });
      if (databaseErrorCode(error) === '23505') return reply.code(409).send({ error: 'contact_sin_already_exists' });
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.post<{
    Params: { firmId: string; companyId: string };
    Headers: { 'idempotency-key'?: string };
    Body: JournalPostInput;
  }>('/v1/firms/:firmId/companies/:companyId/journals', {
    schema: {
      params: firmCompanyParamsSchema,
      headers: {
        type: 'object', required: ['idempotency-key'],
        properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 200 } },
      },
      body: {
        type: 'object', additionalProperties: false, required: ['transactionDate', 'memo', 'lines'],
        properties: {
          transactionDate: { type: 'string', format: 'date' },
          reference: { type: 'string', maxLength: 100 },
          memo: { type: 'string', minLength: 1, maxLength: 500 },
          lines: {
            type: 'array', minItems: 2, maxItems: 500,
            items: {
              type: 'object', additionalProperties: false,
              required: ['accountId', 'debitCents', 'creditCents'],
              properties: {
                accountId: { type: 'string', format: 'uuid' },
                description: { type: 'string', maxLength: 500 },
                debitCents: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                creditCents: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                taxCode: { type: 'string', maxLength: 50 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      validateJournalPost(request.body);
      const requestHash = hashJournalRequest(request.params.companyId, request.body);
      const journal = await dependencies.database.createAndPostJournal(
        user, request.params.firmId, request.params.companyId,
        request.headers['idempotency-key']!, requestHash, request.body,
      );
      return reply.code(201).send({ journal });
    } catch (error) {
      if (error instanceof JournalValidationError) return reply.code(400).send({ error: 'invalid_journal', message: error.message });
      if (error instanceof IdempotencyConflictError) return reply.code(409).send({ error: error.message });
      if (error instanceof IdempotencyInProgressError) return reply.code(409).send({ error: error.message });
      if (error instanceof Error && error.message.includes('period is locked')) return reply.code(423).send({ error: 'accounting_period_locked' });
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.get<{
    Params: { firmId: string; companyId: string };
    Querystring: { startDate: string; endDate: string };
  }>('/v1/firms/:firmId/companies/:companyId/general-ledger', {
    schema: {
      params: firmCompanyParamsSchema,
      querystring: {
        type: 'object', additionalProperties: false, required: ['startDate', 'endDate'],
        properties: { startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' } },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    if (request.query.startDate > request.query.endDate) return reply.code(400).send({ error: 'invalid_date_range' });
    try {
      return { rows: await dependencies.database.generalLedger(
        user, request.params.firmId, request.params.companyId, request.query.startDate, request.query.endDate,
      ) };
    } catch (error) {
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.post<{
    Params: { firmId: string; companyId: string };
    Headers: { 'idempotency-key'?: string };
    Body: {
      transactionType: 'sale' | 'expense'; transactionDate: string; description: string;
      counterpartyName?: string; bankAccountId: string; categoryAccountId: string;
      taxCode: HstCode; baseCents: number; manualHstCents?: number;
    };
  }>('/v1/firms/:firmId/companies/:companyId/business-transactions', {
    schema: {
      params: firmCompanyParamsSchema,
      headers: {
        type: 'object', required: ['idempotency-key'],
        properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 200 } },
      },
      body: {
        type: 'object', additionalProperties: false,
        required: ['transactionType', 'transactionDate', 'description', 'bankAccountId', 'categoryAccountId', 'taxCode', 'baseCents'],
        properties: {
          transactionType: { type: 'string', enum: ['sale', 'expense'] },
          transactionDate: { type: 'string', format: 'date' },
          description: { type: 'string', minLength: 1, maxLength: 500 },
          counterpartyName: { type: 'string', maxLength: 200 },
          bankAccountId: { type: 'string', format: 'uuid' },
          categoryAccountId: { type: 'string', format: 'uuid' },
          taxCode: { type: 'string', enum: ['hst_13', 'hst_exempt', 'manual_hst'] },
          baseCents: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
          manualHstCents: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        },
      },
    },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    try {
      const calculation = calculateHst(request.body.baseCents, request.body.taxCode, request.body.manualHstCents);
      const input = { ...request.body, ...calculation };
      const requestHash = hashBusinessTransactionRequest(request.params.companyId, input);
      const transaction = await dependencies.database.createBusinessTransaction(
        user, request.params.firmId, request.params.companyId,
        request.headers['idempotency-key']!, requestHash, input,
      );
      return reply.code(201).send({ transaction });
    } catch (error) {
      if (error instanceof HstCalculationError) return reply.code(400).send({ error: 'invalid_hst', message: error.message });
      if (error instanceof BusinessTransactionAccountError) return reply.code(400).send({ error: error.message });
      if (error instanceof IdempotencyConflictError || error instanceof IdempotencyInProgressError) {
        return reply.code(409).send({ error: error.message });
      }
      if (error instanceof Error && error.message.includes('period is locked')) return reply.code(423).send({ error: 'accounting_period_locked' });
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.get<{
    Params: { firmId: string; companyId: string }; Querystring: { startDate: string; endDate: string };
  }>('/v1/firms/:firmId/companies/:companyId/business-transactions', {
    schema: { params: firmCompanyParamsSchema, querystring: dateRangeQuerySchema },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    if (request.query.startDate > request.query.endDate) return reply.code(400).send({ error: 'invalid_date_range' });
    try {
      return { transactions: await dependencies.database.listBusinessTransactions(
        user, request.params.firmId, request.params.companyId, request.query.startDate, request.query.endDate,
      ) };
    } catch (error) {
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.get<{
    Params: { firmId: string; companyId: string }; Querystring: { startDate: string; endDate: string };
  }>('/v1/firms/:firmId/companies/:companyId/sales-tax-summary', {
    schema: { params: firmCompanyParamsSchema, querystring: dateRangeQuerySchema },
  }, async (request, reply) => {
    const user = await authenticateRequest(request.headers.authorization, dependencies.verifyToken, reply);
    if (!user) return;
    if (request.query.startDate > request.query.endDate) return reply.code(400).send({ error: 'invalid_date_range' });
    try {
      return { summary: await dependencies.database.salesTaxSummary(
        user, request.params.firmId, request.params.companyId, request.query.startDate, request.query.endDate,
      ) };
    } catch (error) {
      return sendAccountingAccessError(error, reply, request.log);
    }
  });

  app.get<{
    Params:{firmId:string;companyId:string};Querystring:{startDate:string;endDate:string};
  }>('/v1/firms/:firmId/companies/:companyId/sales-tax-summary/categories',{
    schema:{params:firmCompanyParamsSchema,querystring:dateRangeQuerySchema},
  },async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    if(request.query.startDate>request.query.endDate)return reply.code(400).send({error:'invalid_date_range'});
    try{return{categories:await dependencies.database.salesTaxCategorySummary(user,request.params.firmId,request.params.companyId,request.query.startDate,request.query.endDate)};}
    catch(error){return sendAccountingAccessError(error,reply,request.log);}
  });

  app.post<{Params:{firmId:string;companyId:string};Headers:{'idempotency-key'?:string};Body:{transferDate:string;fromAccountId:string;toAccountId:string;amountCents:number;memo?:string}}>(
    '/v1/firms/:firmId/companies/:companyId/bank-transfers',{schema:{params:firmCompanyParamsSchema,headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',minLength:16,maxLength:200}}},
      body:{type:'object',additionalProperties:false,required:['transferDate','fromAccountId','toAccountId','amountCents'],properties:{transferDate:{type:'string',format:'date'},fromAccountId:{type:'string',format:'uuid'},toAccountId:{type:'string',format:'uuid'},
        amountCents:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},memo:{type:'string',maxLength:500}}}}},async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
      try{validateBankTransfer(request.body);const hash=hashBankTransferRequest(request.params.companyId,request.body);const transfer=await dependencies.database.createBankTransfer(user,request.params.firmId,request.params.companyId,request.headers['idempotency-key']!,hash,request.body);return reply.code(201).send({transfer});}
      catch(error){if(error instanceof BankTransferValidationError||error instanceof BankTransferAccountError)return reply.code(400).send({error:error.message});if(error instanceof IdempotencyConflictError||error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});
        if(error instanceof Error&&error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});return sendAccountingAccessError(error,reply,request.log);}});

  app.post<{Params:{firmId:string;companyId:string};Body:{accountId:string;sourceName:string;csvContent:string}}>('/v1/firms/:firmId/companies/:companyId/bank-imports/csv',{schema:{params:firmCompanyParamsSchema,
    body:{type:'object',additionalProperties:false,required:['accountId','sourceName','csvContent'],properties:{accountId:{type:'string',format:'uuid'},sourceName:{type:'string',minLength:1,maxLength:255},csvContent:{type:'string',minLength:1,maxLength:900000}}}}},async(request,reply)=>{
      const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;try{inspectBankCsvUpload(request.body.sourceName,request.body.csvContent);const parsed=parseBankCsv(request.body.accountId,request.body.csvContent);const batch=await dependencies.database.createBankCsvImport(user,request.params.firmId,request.params.companyId,
        {accountId:request.body.accountId,sourceName:request.body.sourceName,contentSha256:parsed.contentSha256,rows:parsed.rows});return reply.code(201).send({batch});}catch(error){if(error instanceof BankImportValidationError||error instanceof BankTransferAccountError)return reply.code(400).send({error:error.message});
        if(error instanceof UnsafeUploadError)return reply.code(422).send({error:error.message});
        if(databaseErrorCode(error)==='23505')return reply.code(409).send({error:'bank_file_already_imported'});return sendAccountingAccessError(error,reply,request.log);}});

  app.get<{Params:{firmId:string;companyId:string};Querystring:{accountId?:string}}>('/v1/firms/:firmId/companies/:companyId/bank-import-rows',{schema:{params:firmCompanyParamsSchema,querystring:{type:'object',additionalProperties:false,
    properties:{accountId:{type:'string',format:'uuid'}}}}},async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;try{return{rows:await dependencies.database.listBankImportRows(user,request.params.firmId,request.params.companyId,request.query.accountId)};}
      catch(error){return sendAccountingAccessError(error,reply,request.log);}});

  app.get<{Params:{firmId:string;companyId:string}}>('/v1/firms/:firmId/companies/:companyId/vendor-bills',{schema:{params:firmCompanyParamsSchema}},async(request,reply)=>{
    const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    try{return{bills:await dependencies.database.listVendorBills(user,request.params.firmId,request.params.companyId)};}catch(error){return sendAccountingAccessError(error,reply,request.log);}
  });

  app.post<{Params:{firmId:string;companyId:string};Headers:{'idempotency-key'?:string};Body:{vendorId:string;vendorInvoiceNumber:string;billDate:string;dueDate:string;memo?:string;lines:VendorBillLineInput[]}}>(
    '/v1/firms/:firmId/companies/:companyId/vendor-bills',
    {
      schema: {
        params: firmCompanyParamsSchema,
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {'idempotency-key': {type: 'string', minLength: 16, maxLength: 200}},
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['vendorId', 'vendorInvoiceNumber', 'billDate', 'dueDate', 'lines'],
          properties: {
            vendorId: {type: 'string', format: 'uuid'},
            vendorInvoiceNumber: {type: 'string', minLength: 1, maxLength: 100},
            billDate: {type: 'string', format: 'date'},
            dueDate: {type: 'string', format: 'date'},
            memo: {type: 'string', maxLength: 500},
            lines: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['description', 'expenseAccountId', 'taxCode', 'baseCents'],
                properties: {
                  description: {type: 'string', minLength: 1, maxLength: 500},
                  expenseAccountId: {type: 'string', format: 'uuid'},
                  taxCode: {type: 'string', enum: ['hst_13', 'hst_exempt', 'manual_hst']},
                  baseCents: {type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
                  manualHstCents: {type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER},
                },
              },
            },
          },
        },
      },
    },
    async(request,reply)=>{
      const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;if(request.body.dueDate<request.body.billDate)return reply.code(400).send({error:'due_date_before_bill_date'});
      try{const calculated=calculateVendorBill(request.body.lines);const requestHash=hashVendorBillRequest(request.params.companyId,request.body);const bill=await dependencies.database.createVendorBill(user,request.params.firmId,request.params.companyId,
        request.headers['idempotency-key']!,requestHash,{...request.body,calculated});return reply.code(201).send({bill});
      }catch(error){if(error instanceof VendorBillCalculationError||error instanceof HstCalculationError)return reply.code(400).send({error:'invalid_vendor_bill',message:error.message});
        if(error instanceof VendorBillAccountError||error instanceof VendorBillVendorError)return reply.code(400).send({error:error.message});
        if(databaseErrorCode(error)==='23505')return reply.code(409).send({error:'duplicate_vendor_invoice'});
        if(error instanceof IdempotencyConflictError||error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});
        if(error instanceof Error&&error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});return sendAccountingAccessError(error,reply,request.log);}
    });

  app.get<{Params:{firmId:string;companyId:string;billId:string}}>('/v1/firms/:firmId/companies/:companyId/vendor-bills/:billId',{schema:{params:firmCompanyBillParamsSchema}},async(request,reply)=>{
    const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
    try{return{bill:await dependencies.database.getVendorBill(user,request.params.firmId,request.params.companyId,request.params.billId)};}catch(error){if(error instanceof VendorBillNotFoundError)return reply.code(404).send({error:error.message});return sendAccountingAccessError(error,reply,request.log);}
  });

  app.post<{Params:{firmId:string;companyId:string;billId:string};Headers:{'idempotency-key'?:string};Body:{paymentDate:string;amountCents:number;bankAccountId:string;reference?:string}}>(
    '/v1/firms/:firmId/companies/:companyId/vendor-bills/:billId/payments',
    {
      schema: {
        params: firmCompanyBillParamsSchema,
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {'idempotency-key': {type: 'string', minLength: 16, maxLength: 200}},
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['paymentDate', 'amountCents', 'bankAccountId'],
          properties: {
            paymentDate: {type: 'string', format: 'date'},
            amountCents: {type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
            bankAccountId: {type: 'string', format: 'uuid'},
            reference: {type: 'string', maxLength: 100},
          },
        },
      },
    },
    async(request,reply)=>{const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
      try{validateVendorPayment(request.body);const requestHash=hashVendorPaymentRequest(request.params.companyId,request.params.billId,request.body);const payment=await dependencies.database.createVendorPayment(user,request.params.firmId,request.params.companyId,
        request.params.billId,request.headers['idempotency-key']!,requestHash,request.body);return reply.code(201).send({payment});
      }catch(error){if(error instanceof VendorPaymentValidationError)return reply.code(400).send({error:'invalid_vendor_payment',message:error.message});if(error instanceof VendorPaymentAllocationError)return reply.code(409).send({error:error.message});
        if(error instanceof VendorBillAccountError)return reply.code(400).send({error:error.message});if(error instanceof IdempotencyConflictError||error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});
        if(error instanceof Error&&error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});return sendAccountingAccessError(error,reply,request.log);}
    });

  app.post<{Params:{firmId:string;companyId:string;billId:string};Headers:{'idempotency-key'?:string};Body:{voidDate:string;reason:string}}>(
    '/v1/firms/:firmId/companies/:companyId/vendor-bills/:billId/void',
    {
      schema: {
        params: firmCompanyBillParamsSchema,
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {'idempotency-key': {type: 'string', minLength: 16, maxLength: 200}},
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['voidDate', 'reason'],
          properties: {
            voidDate: {type: 'string', format: 'date'},
            reason: {type: 'string', minLength: 3, maxLength: 500},
          },
        },
      },
    },
    async(request,reply)=>{
      const user=await authenticateRequest(request.headers.authorization,dependencies.verifyToken,reply);if(!user)return;
      try{validateInvoiceVoid(request.body);const requestHash=hashInvoiceVoidRequest(request.params.companyId,`vendor-bill:${request.params.billId}`,request.body);return{bill:await dependencies.database.voidVendorBill(user,request.params.firmId,request.params.companyId,
        request.params.billId,request.headers['idempotency-key']!,requestHash,request.body)};
      }catch(error){if(error instanceof InvoiceVoidValidationError)return reply.code(400).send({error:'invalid_bill_void',message:error.message});if(error instanceof VendorBillVoidConflictError)return reply.code(409).send({error:error.message});
        if(error instanceof IdempotencyConflictError||error instanceof IdempotencyInProgressError)return reply.code(409).send({error:error.message});if(error instanceof Error&&error.message.includes('period is locked'))return reply.code(423).send({error:'accounting_period_locked'});
        return sendAccountingAccessError(error,reply,request.log);}
    });

  return app;
}

const uuidFirmParamsSchema = {
  type: 'object', additionalProperties: false, required: ['firmId'],
  properties: { firmId: { type: 'string', format: 'uuid' } },
} as const;

const firmCompanyParamsSchema = {
  type: 'object', additionalProperties: false, required: ['firmId', 'companyId'],
  properties: {
    firmId: { type: 'string', format: 'uuid' },
    companyId: { type: 'string', format: 'uuid' },
  },
} as const;

const firmCompanyInvoiceParamsSchema={
  type:'object',additionalProperties:false,required:['firmId','companyId','invoiceId'],properties:{
    firmId:{type:'string',format:'uuid'},companyId:{type:'string',format:'uuid'},invoiceId:{type:'string',format:'uuid'},
  },
} as const;

const firmCompanyProductParamsSchema={type:'object',additionalProperties:false,required:['firmId','companyId','productId'],properties:{
  firmId:{type:'string',format:'uuid'},companyId:{type:'string',format:'uuid'},productId:{type:'string',format:'uuid'},
}} as const;
const firmCompanyBillParamsSchema={type:'object',additionalProperties:false,required:['firmId','companyId','billId'],properties:{
  firmId:{type:'string',format:'uuid'},companyId:{type:'string',format:'uuid'},billId:{type:'string',format:'uuid'},
}} as const;

const dateRangeQuerySchema = {
  type: 'object', additionalProperties: false, required: ['startDate', 'endDate'],
  properties: { startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' } },
} as const;

async function authenticateRequest(
  authorizationHeader: string | undefined,
  verifyToken: TokenVerifier,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
): Promise<AuthenticatedUser | null> {
  try {
    return await verifyToken(authorizationHeader);
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
}

function databaseErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function sendAccountingAccessError(
  error: unknown,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  log: { error(details: unknown, message: string): void },
): unknown {
  if (error instanceof TenantAccessDeniedError) return reply.code(403).send({ error: 'forbidden' });
  if (error instanceof SubscriptionAccessDeniedError) return reply.code(403).send({ error: 'subscription_inactive' });
  if (error instanceof SubscriptionReadOnlyError) return reply.code(403).send({ error: 'subscription_read_only' });
  log.error({ error }, 'accounting request failed');
  return reply.code(500).send({ error: 'service_unavailable' });
}
