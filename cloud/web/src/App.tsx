import { useEffect, useMemo, useState } from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import { getAccessToken, initializeAuthentication, signIn, signOut } from './auth.js';
import {
  ApexLedgerApi, ApiError, type Account, type BankImportRow, type BusinessTransaction, type Company, type CompanyContact,
  type Firm, type FirmRole, type FirmSeatSummary, type PlatformRole,type PlatformSubscription,type PlatformSubscriptionAction,type ProductService, type SalesInvoice, type SalesTaxCategorySummary, type SalesTaxSummary, type SubscriptionResponse, type VendorBill,
} from './api.js';
import { bankAccounts, calculateVisibleHst, categoryAccounts, formatCad } from './viewModel.js';

const api = new ApexLedgerApi(getAccessToken);
const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
const defaultDueDate = new Date(Date.now()+30*86_400_000).toISOString().slice(0,10);
const emptySummary: SalesTaxSummary = {
  salesBaseCents: '0', hstCollectedCents: '0', expenseBaseCents: '0', itcPaidCents: '0', netHstPayableCents: '0',
};

type FormState = {
  transactionType: 'sale' | 'expense'; transactionDate: string; description: string; counterpartyName: string;
  bankAccountId: string; categoryAccountId: string; taxCode: 'hst_13' | 'hst_exempt' | 'manual_hst';
  baseAmount: string; manualHstAmount: string;
};

const initialForm: FormState = {
  transactionType: 'expense', transactionDate: today, description: '', counterpartyName: '',
  bankAccountId: '', categoryAccountId: '', taxCode: 'hst_13', baseAmount: '', manualHstAmount: '',
};

type ContactFormState = { contactType: 'customer' | 'vendor' | 'both'; entityType: 'business' | 'person';
  displayName: string; companyName: string; email: string; phone: string; addressLine1: string; city: string;
  province: string; postalCode: string; dateOfBirth: string; sin: string };
const initialContact: ContactFormState = { contactType: 'customer', entityType: 'business',
  displayName: '', companyName: '', email: '', phone: '', addressLine1: '', city: '', province: 'ON',
  postalCode: '', dateOfBirth: '', sin: '' };
type InvoiceLineFormState={productId:string;description:string;quantity:string;unitPrice:string;revenueAccountId:string;
  taxCode:'hst_13'|'hst_exempt'|'manual_hst';manualHstAmount:string};
type InvoiceFormState={customerId:string;invoiceDate:string;dueDate:string;memo:string;lines:InvoiceLineFormState[]};
const emptyInvoiceLine=(revenueAccountId=''):InvoiceLineFormState=>({productId:'',description:'',quantity:'1',unitPrice:'',revenueAccountId,taxCode:'hst_13',manualHstAmount:''});
const initialInvoice:InvoiceFormState={customerId:'',invoiceDate:today,dueDate:defaultDueDate,memo:'',lines:[emptyInvoiceLine()]};
const initialProduct={itemType:'service' as 'product'|'service',name:'',description:'',sku:'',unitPrice:'',revenueAccountId:'',defaultTaxCode:'hst_13' as 'hst_13'|'hst_exempt'|'manual_hst'};
const initialTransfer={transferDate:today,fromAccountId:'',toAccountId:'',amount:'',memo:''};
type BillLineFormState={description:string;expenseAccountId:string;taxCode:'hst_13'|'hst_exempt'|'manual_hst';baseAmount:string;manualHstAmount:string};
type BillFormState={vendorId:string;vendorInvoiceNumber:string;billDate:string;dueDate:string;memo:string;lines:BillLineFormState[]};
const emptyBillLine=(expenseAccountId=''):BillLineFormState=>({description:'',expenseAccountId,taxCode:'hst_13',baseAmount:'',manualHstAmount:''});
const initialBill:BillFormState={vendorId:'',vendorInvoiceNumber:'',billDate:today,dueDate:defaultDueDate,memo:'',lines:[emptyBillLine()]};

export function App() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [summary, setSummary] = useState<SalesTaxSummary>(emptySummary);
  const [taxCategories,setTaxCategories]=useState<SalesTaxCategorySummary[]>([]);
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactType, setContactType] = useState('');
  const [contactForm, setContactForm] = useState(initialContact);
  const [products,setProducts]=useState<ProductService[]>([]);
  const [invoices,setInvoices]=useState<SalesInvoice[]>([]);
  const [invoiceForm,setInvoiceForm]=useState<InvoiceFormState>(initialInvoice);
  const [productForm,setProductForm]=useState(initialProduct);
  const [editingProduct,setEditingProduct]=useState<ProductService|null>(null);
  const [invoiceFormOpen,setInvoiceFormOpen]=useState(true);
  const [bills,setBills]=useState<VendorBill[]>([]);
  const [billForm,setBillForm]=useState<BillFormState>(initialBill);
  const [billFormOpen,setBillFormOpen]=useState(true);
  const [form, setForm] = useState<FormState>(initialForm);
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [seats,setSeats]=useState<FirmSeatSummary|null>(null);
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteRole,setInviteRole]=useState<Exclude<FirmRole,'owner'>>('accountant');
  const [inviteCompanyIds,setInviteCompanyIds]=useState<string[]>([]);
  const [inviteLink,setInviteLink]=useState('');
  const [requestedSeats,setRequestedSeats]=useState('');
  const [invitationToken,setInvitationToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('invite')??'');
  const [acceptingInvitation,setAcceptingInvitation]=useState(false);
  const [editingSeatUserId,setEditingSeatUserId]=useState('');
  const [editingSeatCompanyIds,setEditingSeatCompanyIds]=useState<string[]>([]);
  const [transferForm,setTransferForm]=useState(initialTransfer);
  const [bankImportRows,setBankImportRows]=useState<BankImportRow[]>([]);
  const [bankImportAccountId,setBankImportAccountId]=useState('');
  const [bankImportFile,setBankImportFile]=useState<File|null>(null);
  const [mfaVerified,setMfaVerified]=useState(false);
  const [mfaChallengeId,setMfaChallengeId]=useState('');
  const [mfaDestination,setMfaDestination]=useState('');
  const [mfaCode,setMfaCode]=useState('');
  const [platformRole,setPlatformRole]=useState<PlatformRole|null>(null);
  const [platformSubscriptions,setPlatformSubscriptions]=useState<PlatformSubscription[]>([]);
  const [platformActions,setPlatformActions]=useState<PlatformSubscriptionAction[]>([]);
  const [platformReason,setPlatformReason]=useState('Customer request confirmed');
  const [platformRenewalDate,setPlatformRenewalDate]=useState(()=>{const date=new Date();date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString().slice(0,10);});

  useEffect(() => {
    void initializeAuthentication().then(setAccount).catch(showError).finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    if(!account){setMfaVerified(false);return;}setError('');
    if(api.hasActiveMfaSession()){setMfaVerified(true);return;}
    const pending=api.getPendingMfaChallenge();
    if(pending){setMfaChallengeId(pending.challengeId??'');setMfaDestination(pending.destination??'your verified email');return;}
    void api.startEmailMfa().then((result)=>{if(!result.required){setMfaVerified(true);return;}setMfaChallengeId(result.challengeId??'');setMfaDestination(result.destination??'your verified email');})
      .catch(showError);
  },[account]);

  useEffect(() => {
    if (!account||!mfaVerified) return;
    void api.firms().then(({ firms: rows }) => {
      setFirms(rows);
      setFirmId((current) => current || rows[0]?.id || '');
    }).catch(showError);
    void api.platformMe().then(({role})=>{setPlatformRole(role);if(role)void Promise.all([api.platformSubscriptions(),api.platformSubscriptionActions()]).then(([subscriptions,actions])=>{setPlatformSubscriptions(subscriptions.subscriptions);setPlatformActions(actions.actions);}).catch(showError);}).catch(()=>setPlatformRole(null));
  }, [account,mfaVerified]);

  useEffect(()=>{if(!account||!mfaVerified||!invitationToken||acceptingInvitation)return;setAcceptingInvitation(true);setError('');
    void api.acceptInvitation(invitationToken).then(async({membership})=>{window.history.replaceState({},'',`${window.location.pathname}${window.location.search}`);setInvitationToken('');
      setMessage(`Invitation accepted with ${accessLabel(membership.role).toLowerCase()} access.`);const response=await api.firms();setFirms(response.firms);setFirmId(membership.firmId);})
      .catch((caught)=>{showError(caught);setError('Invitation could not be accepted. Confirm that you signed in with the exact invited email and that the link has not expired.');})
      .finally(()=>setAcceptingInvitation(false));},[account,mfaVerified,invitationToken]);

  useEffect(() => {
    if (!firmId) return;
    setCompanyId('');
    setSubscription(null);
    void Promise.all([api.companies(firmId), api.subscription(firmId)])
      .then(([companyResponse, subscriptionResponse]) => {
        setCompanies(companyResponse.companies);
        setCompanyId(companyResponse.companies[0]?.id ?? '');
        setSubscription(subscriptionResponse);
      }).catch(showError);
  }, [firmId]);

  const refreshCompany = async () => {
    if (!firmId || !companyId) return;
    const [accountResponse, transactionResponse, summaryResponse, contactResponse,categoryResponse] = await Promise.all([
      api.accounts(firmId, companyId), api.transactions(firmId, companyId, yearStart, today),
      api.salesTaxSummary(firmId, companyId, yearStart, today), api.contacts(firmId, companyId),api.salesTaxCategories(firmId,companyId,yearStart,today),
    ]);
    setAccounts(accountResponse.accounts);
    setTransactions(transactionResponse.transactions);
    setSummary(summaryResponse.summary);
    setContacts(contactResponse.contacts);
    setTaxCategories(categoryResponse.categories);
  };

  useEffect(() => { void refreshCompany().catch(showError); }, [firmId, companyId]);
  const isFirmAdmin=subscription?.subscription.role==='owner'||subscription?.subscription.role==='firm_admin';
  const isBusinessWorkspace=subscription?.subscription.workspaceType==='business';
  const refreshSeats=async()=>{if(!firmId||!isFirmAdmin){setSeats(null);return;}setSeats(await api.seats(firmId));};
  useEffect(()=>{void refreshSeats().catch(showError);},[firmId,isFirmAdmin]);

  const refreshAdvanced=async()=>{
    if(!firmId||!companyId||!subscription?.capabilities.showAdvancedAccounting)return;
    const [productResponse,invoiceResponse,billResponse]=await Promise.all([api.productsServices(firmId,companyId),api.salesInvoices(firmId,companyId),api.vendorBills(firmId,companyId)]);
    setProducts(productResponse.products);setInvoices(invoiceResponse.invoices);setBills(billResponse.bills);
  };
  useEffect(()=>{void refreshAdvanced().catch(showError);},[firmId,companyId,subscription?.capabilities.showAdvancedAccounting]);

  useEffect(() => {
    if (!firmId || !companyId) return;
    const timer = window.setTimeout(() => {
      void api.contacts(firmId, companyId, contactSearch, contactType)
        .then((response) => setContacts(response.contacts)).catch(showError);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [firmId, companyId, contactSearch, contactType]);

  useEffect(() => {
    if (form.description.trim().length < 3 || !account) { setSuggestion(''); return; }
    const timer = window.setTimeout(() => {
      void api.taxSuggestion(form.description).then(({ suggestion: result }) => {
        setForm((current) => ({ ...current, taxCode: result.taxCode }));
        setSuggestion(result.reason);
      }).catch(() => setSuggestion('Tax suggestion unavailable; select the tax treatment manually.'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form.description, account]);

  const banks = useMemo(() => bankAccounts(accounts), [accounts]);
  const revenueAccounts=useMemo(()=>accounts.filter((item)=>item.accountType==='revenue'&&item.active),[accounts]);
  const expenseAccounts=useMemo(()=>accounts.filter((item)=>item.accountType==='expense'&&item.active),[accounts]);
  const customers=useMemo(()=>contacts.filter((item)=>item.contactType==='customer'||item.contactType==='both'),[contacts]);
  const vendors=useMemo(()=>contacts.filter((item)=>item.contactType==='vendor'||item.contactType==='both'),[contacts]);
  const categories = useMemo(() => categoryAccounts(accounts, form.transactionType), [accounts, form.transactionType]);
  useEffect(() => {
    setForm((current) => ({
      ...current,
      bankAccountId: banks.some((item) => item.id === current.bankAccountId) ? current.bankAccountId : banks[0]?.id ?? '',
      categoryAccountId: categories.some((item) => item.id === current.categoryAccountId) ? current.categoryAccountId : categories[0]?.id ?? '',
    }));
  }, [banks, categories]);
  useEffect(()=>setTransferForm((current)=>({...current,fromAccountId:banks.some((item)=>item.id===current.fromAccountId)?current.fromAccountId:banks[0]?.id??'',
    toAccountId:banks.some((item)=>item.id===current.toAccountId&&item.id!==current.fromAccountId)?current.toAccountId:banks.find((item)=>item.id!==current.fromAccountId)?.id??''})),[banks]);
  useEffect(()=>setBankImportAccountId((current)=>banks.some((item)=>item.id===current)?current:banks[0]?.id??''),[banks]);
  const refreshBankRows=async()=>{if(!firmId||!companyId)return;setBankImportRows((await api.bankImportRows(firmId,companyId,bankImportAccountId)).rows);};
  useEffect(()=>{void refreshBankRows().catch(showError);},[firmId,companyId,bankImportAccountId]);
  useEffect(()=>{
    setInvoiceForm((current)=>({...current,
      customerId:customers.some((item)=>item.id===current.customerId)?current.customerId:customers[0]?.id??'',
      lines:current.lines.map((line)=>({...line,revenueAccountId:revenueAccounts.some((item)=>item.id===line.revenueAccountId)?line.revenueAccountId:revenueAccounts[0]?.id??''})),
    }));
    setProductForm((current)=>({...current,revenueAccountId:revenueAccounts.some((item)=>item.id===current.revenueAccountId)?current.revenueAccountId:revenueAccounts[0]?.id??''}));
  },[customers,revenueAccounts]);
  useEffect(()=>{setBillForm((current)=>({...current,vendorId:vendors.some((item)=>item.id===current.vendorId)?current.vendorId:vendors[0]?.id??'',
    lines:current.lines.map((line)=>({...line,expenseAccountId:expenseAccounts.some((item)=>item.id===line.expenseAccountId)?line.expenseAccountId:expenseAccounts[0]?.id??''}))}));},[vendors,expenseAccounts]);

  const baseCents = moneyToCents(form.baseAmount);
  const manualHstCents = moneyToCents(form.manualHstAmount);
  const hstCents = calculateVisibleHst(baseCents, form.taxCode, manualHstCents);
  const totalCents = baseCents + hstCents;
  const invoiceTotals=invoiceForm.lines.reduce((totals,line)=>{const base=Math.round(quantityToMilli(line.quantity)*moneyToCents(line.unitPrice)/1000);
    const hst=base>0?calculateVisibleHst(base,line.taxCode,moneyToCents(line.manualHstAmount)):0;return{base:totals.base+base,hst:totals.hst+hst};},{base:0,hst:0});
  const billTotals=billForm.lines.reduce((totals,line)=>{const base=moneyToCents(line.baseAmount);const hst=base>0?calculateVisibleHst(base,line.taxCode,moneyToCents(line.manualHstAmount)):0;
    return{base:totals.base+base,hst:totals.hst+hst};},{base:0,hst:0});
  const canEnter = subscription?.capabilities.canEnterSalesAndExpenses === true;

  const submit = async () => {
    setError(''); setMessage('');
    if (!firmId || !companyId || !form.bankAccountId || !form.categoryAccountId || baseCents <= 0) {
      setError('Complete the date, account, category, description and amount.'); return;
    }
    setBusy(true);
    try {
      await api.createTransaction(firmId, companyId, {
        transactionType: form.transactionType, transactionDate: form.transactionDate,
        description: form.description, counterpartyName: form.counterpartyName || undefined,
        bankAccountId: form.bankAccountId, categoryAccountId: form.categoryAccountId,
        taxCode: form.taxCode, baseCents,
        ...(form.taxCode === 'manual_hst' ? { manualHstCents } : {}),
      });
      setMessage(`${form.transactionType === 'sale' ? 'Sale' : 'Expense'} saved and posted.`);
      setForm((current) => ({ ...initialForm, transactionType: current.transactionType,
        bankAccountId: current.bankAccountId, categoryAccountId: current.categoryAccountId }));
      await refreshCompany();
    } catch (caught) { showError(caught); } finally { setBusy(false); }
  };

  const submitContact = async () => {
    setError(''); setMessage('');
    if (!firmId || !companyId || !contactForm.displayName.trim()) { setError('Enter the customer or vendor name.'); return; }
    setBusy(true);
    try {
      await api.createContact(firmId, companyId, Object.fromEntries(
        Object.entries(contactForm).filter(([, value]) => value !== ''),
      ));
      setContactForm(initialContact);
      setMessage('Customer/vendor saved.');
      const response = await api.contacts(firmId, companyId, contactSearch, contactType);
      setContacts(response.contacts);
    } catch (caught) { showError(caught); } finally { setBusy(false); }
  };

  const updateInvoiceLine=(index:number,change:Partial<InvoiceLineFormState>)=>setInvoiceForm((current)=>({...current,lines:current.lines.map((line,lineIndex)=>lineIndex===index?{...line,...change}:line)}));
  const selectProduct=(index:number,productId:string)=>{
    const product=products.find((item)=>item.id===productId);
    const current=invoiceForm.lines[index];if(!current)return;updateInvoiceLine(index,{productId,description:product?.description||product?.name||current.description,
      unitPrice:product?centsToInput(product.unitPriceCents):current.unitPrice,revenueAccountId:product?.revenueAccountId||current.revenueAccountId,
      taxCode:product?.defaultTaxCode||current.taxCode});
  };

  const submitInvoice=async(closeAfter:boolean)=>{
    setError('');setMessage('');
    const lines=invoiceForm.lines.map((line)=>({description:line.description,quantityMilli:quantityToMilli(line.quantity),unitPriceCents:moneyToCents(line.unitPrice),
      revenueAccountId:line.revenueAccountId,productId:line.productId||undefined,taxCode:line.taxCode,...(line.taxCode==='manual_hst'?{manualHstCents:moneyToCents(line.manualHstAmount)}:{})}));
    if(!firmId||!companyId||!invoiceForm.customerId||lines.some((line)=>!line.revenueAccountId||!line.description.trim()||line.quantityMilli<=0||line.unitPriceCents<0)){
      setError('Complete the customer, dates, description, quantity, price and revenue account.');return;
    }
    setBusy(true);try{
      await api.createSalesInvoice(firmId,companyId,{customerId:invoiceForm.customerId,invoiceDate:invoiceForm.invoiceDate,dueDate:invoiceForm.dueDate,
        memo:invoiceForm.memo||undefined,lines});
      setMessage('Invoice saved, numbered and posted to Accounts Receivable.');setInvoiceForm((current)=>({...initialInvoice,customerId:current.customerId,lines:[emptyInvoiceLine(revenueAccounts[0]?.id??'')]}));
      setInvoiceFormOpen(!closeAfter);await Promise.all([refreshAdvanced(),refreshCompany()]);
    }catch(caught){showError(caught);}finally{setBusy(false);}
  };

  const submitProduct=async()=>{
    if(!firmId||!companyId||!productForm.name.trim()||!productForm.revenueAccountId){setError('Complete the product/service name and revenue account.');return;}
    setBusy(true);try{const input={...productForm,unitPriceCents:moneyToCents(productForm.unitPrice)};
      if(editingProduct)await api.updateProductService(firmId,companyId,editingProduct.id,{...input,expectedVersion:editingProduct.version});
      else await api.createProductService(firmId,companyId,input);
      setProductForm({...initialProduct,revenueAccountId:productForm.revenueAccountId});setEditingProduct(null);setMessage(`Product/service ${editingProduct?'updated':'saved'}.`);await refreshAdvanced();
    }catch(caught){showError(caught);}finally{setBusy(false);}
  };

  const editProduct=(product:ProductService)=>{setEditingProduct(product);setProductForm({itemType:product.itemType,name:product.name,description:product.description??'',sku:product.sku??'',
    unitPrice:centsToInput(product.unitPriceCents),revenueAccountId:product.revenueAccountId,defaultTaxCode:product.defaultTaxCode});};

  const receiveFullPayment=async(invoice:SalesInvoice)=>{
    const bank=banks.find((item)=>item.accountKind==='bank');if(!bank){setError('Add a bank account before receiving payment.');return;}
    setBusy(true);try{await api.receiveCustomerPayment(firmId,companyId,invoice.id,{paymentDate:today,amountCents:Number(invoice.balanceCents),bankAccountId:bank.id});
      setMessage(`Payment received for invoice INV-${invoice.invoiceNumber.padStart(6,'0')}.`);await Promise.all([refreshAdvanced(),refreshCompany()]);
    }catch(caught){showError(caught);}finally{setBusy(false);}
  };

  const copyInvoice=async(invoiceId:string)=>{
    try{const{invoice}=await api.salesInvoice(firmId,companyId,invoiceId);setInvoiceForm({customerId:invoice.customerId,invoiceDate:today,dueDate:defaultDueDate,
      memo:invoice.memo?`Copy of ${invoice.memo}`:'',lines:invoice.lines.map((line)=>({productId:line.productId??'',description:line.description,
        quantity:milliToInput(line.quantityMilli),unitPrice:centsToInput(line.unitPriceCents),revenueAccountId:line.revenueAccountId,taxCode:line.taxCode,
        manualHstAmount:line.taxCode==='manual_hst'?centsToInput(line.hstCents):''}))});setInvoiceFormOpen(true);setMessage('Invoice copied into a new unsaved invoice. A new number will be assigned when saved.');}
    catch(caught){showError(caught);}
  };

  const voidInvoice=async(invoice:SalesInvoice)=>{
    if(!window.confirm(`Void invoice INV-${invoice.invoiceNumber.padStart(6,'0')}? This creates a reversing journal and cannot be undone silently.`))return;
    const reason=window.prompt('Enter the reason for voiding this invoice:','Duplicate or canceled invoice')?.trim();if(!reason)return;
    setBusy(true);try{await api.voidSalesInvoice(firmId,companyId,invoice.id,reason);setMessage('Invoice voided with a balanced reversal and audit record.');await Promise.all([refreshAdvanced(),refreshCompany()]);}
    catch(caught){showError(caught);}finally{setBusy(false);}
  };

  const updateBillLine=(index:number,change:Partial<BillLineFormState>)=>setBillForm((current)=>({...current,lines:current.lines.map((line,lineIndex)=>lineIndex===index?{...line,...change}:line)}));
  const submitBill=async(closeAfter:boolean)=>{setError('');setMessage('');const lines=billForm.lines.map((line)=>({description:line.description,expenseAccountId:line.expenseAccountId,
    taxCode:line.taxCode,baseCents:moneyToCents(line.baseAmount),...(line.taxCode==='manual_hst'?{manualHstCents:moneyToCents(line.manualHstAmount)}:{})}));
    if(!firmId||!companyId||!billForm.vendorId||!billForm.vendorInvoiceNumber.trim()||billForm.dueDate<billForm.billDate||lines.some((line)=>!line.description.trim()||!line.expenseAccountId||line.baseCents<=0)){
      setError('Complete the vendor, supplier invoice number, valid dates, description, expense account and amount.');return;}
    setBusy(true);try{await api.createVendorBill(firmId,companyId,{vendorId:billForm.vendorId,vendorInvoiceNumber:billForm.vendorInvoiceNumber,billDate:billForm.billDate,dueDate:billForm.dueDate,memo:billForm.memo||undefined,lines});
      setBillForm((current)=>({...initialBill,vendorId:current.vendorId,lines:[emptyBillLine(expenseAccounts[0]?.id??'')]}));setBillFormOpen(!closeAfter);setMessage('Bill saved, numbered and posted to Accounts Payable.');
      await Promise.all([refreshAdvanced(),refreshCompany()]);}catch(caught){showError(caught);}finally{setBusy(false);}};
  const copyBill=async(billId:string)=>{try{const{bill}=await api.vendorBill(firmId,companyId,billId);setBillForm({vendorId:bill.vendorId,vendorInvoiceNumber:'',billDate:today,dueDate:defaultDueDate,
    memo:bill.memo?`Copy of ${bill.memo}`:'',lines:bill.lines.map((line)=>({description:line.description,expenseAccountId:line.expenseAccountId,taxCode:line.taxCode,baseAmount:centsToInput(line.baseCents),
      manualHstAmount:line.taxCode==='manual_hst'?centsToInput(line.hstCents):''}))});setBillFormOpen(true);setMessage('Bill copied into a new unsaved bill. Enter the supplier invoice number before saving.');}catch(caught){showError(caught);}};
  const payBill=async(bill:VendorBill)=>{const bank=banks.find((item)=>item.accountKind==='bank');if(!bank){setError('Add a bank account before paying a bill.');return;}setBusy(true);
    try{await api.payVendorBill(firmId,companyId,bill.id,{paymentDate:today,amountCents:Number(bill.balanceCents),bankAccountId:bank.id});setMessage(`Bill BILL-${bill.billNumber.padStart(6,'0')} paid.`);
      await Promise.all([refreshAdvanced(),refreshCompany()]);}catch(caught){showError(caught);}finally{setBusy(false);}};
  const voidBill=async(bill:VendorBill)=>{if(!window.confirm(`Void bill BILL-${bill.billNumber.padStart(6,'0')}? This creates a reversing journal and cannot be silently undone.`))return;
    const reason=window.prompt('Enter the reason for voiding this bill:','Duplicate or canceled bill')?.trim();if(!reason)return;setBusy(true);try{await api.voidVendorBill(firmId,companyId,bill.id,reason);
      setMessage('Bill voided with a balanced reversal and audit record.');await Promise.all([refreshAdvanced(),refreshCompany()]);}catch(caught){showError(caught);}finally{setBusy(false);}};
  const inviteFirmSeat=async()=>{if(!firmId||!inviteEmail.trim()||(inviteRole!=='firm_admin'&&inviteCompanyIds.length===0)){setError('Select at least one client company for this user.');return;}setBusy(true);setInviteLink('');try{const response=await api.inviteSeat(firmId,inviteEmail.trim(),inviteRole,inviteCompanyIds);setInviteEmail('');setInviteLink(response.acceptUrl);
    setMessage('Seat invitation created. Send the secure acceptance link to the named user.');await refreshSeats();}catch(caught){showError(caught);}finally{setBusy(false);}};
  const revokeInvite=async(invitationId:string)=>{if(!window.confirm('Cancel this pending seat invitation?'))return;setBusy(true);try{await api.revokeInvitation(firmId,invitationId);setMessage('Pending invitation canceled and the seat released.');await refreshSeats();}
    catch(caught){showError(caught);}finally{setBusy(false);}};
  const suspendSeat=async(userId:string,label:string)=>{if(!window.confirm(`Suspend access for ${label}? Their accounting records remain in the audit trail.`))return;setBusy(true);try{await api.suspendSeat(firmId,userId);setMessage('Seat suspended and access removed.');await refreshSeats();}
    catch(caught){showError(caught);}finally{setBusy(false);}};
  const requestSeatIncrease=async()=>{const desired=Number(requestedSeats);if(!seats||!Number.isSafeInteger(desired)||desired<=seats.seatLimit){setError(`Enter a seat limit greater than ${seats?.seatLimit??0}.`);return;}setBusy(true);
    try{await api.requestMoreSeats(firmId,desired);setRequestedSeats('');setMessage('Seat increase requested. Current access stays unchanged until billing approves it.');await refreshSeats();}catch(caught){showError(caught);}finally{setBusy(false);}};
  const saveSeatClientAccess=async()=>{if(!editingSeatUserId||editingSeatCompanyIds.length===0){setError('Select at least one client company.');return;}setBusy(true);try{await api.setSeatCompanyAccess(firmId,editingSeatUserId,editingSeatCompanyIds);
    setEditingSeatUserId('');setMessage('Client company access updated. The change applies on the user’s next request.');await refreshSeats();}catch(caught){showError(caught);}finally{setBusy(false);}};
  const submitTransfer=async()=>{const amountCents=moneyToCents(transferForm.amount);if(!firmId||!companyId||!transferForm.fromAccountId||!transferForm.toAccountId||transferForm.fromAccountId===transferForm.toAccountId||amountCents<=0){setError('Select two different bank or credit-card accounts and enter an amount.');return;}
    setBusy(true);try{await api.createBankTransfer(firmId,companyId,{transferDate:transferForm.transferDate,fromAccountId:transferForm.fromAccountId,toAccountId:transferForm.toAccountId,amountCents,memo:transferForm.memo||undefined});
      setTransferForm((current)=>({...initialTransfer,fromAccountId:current.fromAccountId,toAccountId:current.toAccountId}));setMessage('Transfer posted as a balanced journal entry.');await refreshCompany();}catch(caught){showError(caught);}finally{setBusy(false);}};
  const submitBankImport=async()=>{if(!bankImportFile||!bankImportAccountId){setError('Choose a bank or credit-card account and CSV statement.');return;}setBusy(true);try{const csvContent=await bankImportFile.text();const{batch}=await api.importBankCsv(firmId,companyId,{accountId:bankImportAccountId,sourceName:bankImportFile.name,csvContent});
    setMessage(`Statement imported: ${batch.importedRowCount} new rows${batch.duplicateRowCount?`, ${batch.duplicateRowCount} duplicates skipped`:''}. Review them before posting.`);setBankImportFile(null);await refreshBankRows();}catch(caught){showError(caught);}finally{setBusy(false);}};
  const verifySecondFactor=async()=>{if(!mfaChallengeId||!/^[0-9]{6}$/.test(mfaCode)){setError('Enter the six-digit security code.');return;}setBusy(true);try{await api.verifyEmailMfa(mfaChallengeId,mfaCode);setMfaCode('');setMfaVerified(true);setMessage('Email verification complete.');}catch(caught){showError(caught);}finally{setBusy(false);}};
  const manageSubscription=async(row:PlatformSubscription,action:'renew'|'suspend'|'reactivate'|'mark_past_due')=>{if(platformReason.trim().length<3){setError('Enter a support reason for the permanent audit record.');return;}
    if(action==='suspend'&&!window.confirm(`Suspend service for ${row.firmName}? Users will be blocked until reactivated.`))return;const status=action==='suspend'?'suspended':action==='mark_past_due'?'past_due':'active';
    const periodEnd=action==='renew'?`${platformRenewalDate}T23:59:59Z`:row.currentPeriodEnd;setBusy(true);try{await api.managePlatformSubscription(row.firmId,{planCode:row.planCode,status,periodEnd,action,reason:platformReason.trim()});
      setMessage(`${row.firmName} subscription ${action.replaceAll('_',' ')} recorded.`);const [subscriptions,actions]=await Promise.all([api.platformSubscriptions(),api.platformSubscriptionActions()]);setPlatformSubscriptions(subscriptions.subscriptions);setPlatformActions(actions.actions);}catch(caught){showError(caught);}finally{setBusy(false);}};

  function showError(caught: unknown) {
    const detail = caught instanceof ApiError ? caught.code : caught instanceof Error ? caught.message : 'Unexpected error';
    setError(detail.replaceAll('_', ' '));
  }

  if (initializing) return <main className="center-card"><p>Opening Apex Ledger securely…</p></main>;
  if (!account) return (
    <main className="center-card">
      <div className="brand-mark">AL</div><h1>Apex Ledger</h1>
      <p>{invitationToken?'You have been invited to an Apex Ledger firm. Sign in with the exact email address that received the invitation.':'Secure online accounting for businesses and their accountants.'}</p>
      <button className="primary" onClick={() => void signIn().then(setAccount).catch(showError)}>{invitationToken?'Sign in and accept invitation':'Sign in with Microsoft'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
  if(!mfaVerified)return <main className="center-card"><div className="brand-mark">AL</div><h1>Email verification</h1><p>We sent a six-digit Apex Ledger security code to <strong>{mfaDestination||'your verified email'}</strong>. It expires in 10 minutes.</p>
    <label>Security code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e)=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>
    <button className="primary" disabled={busy||mfaCode.length!==6} onClick={()=>void verifySecondFactor()}>Verify and continue</button>{error&&<p className="error" role="alert">{error}</p>}</main>;

  return (
    <div className="app-shell">
      <header>
        <div><span className="brand-mark small">AL</span><strong>Apex Ledger</strong></div>
        <div className="selectors">
          <label>Firm<select value={firmId} onChange={(event) => setFirmId(event.target.value)}>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}</select></label>
          <label>Company<select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}</select></label>
          <button className="quiet" onClick={()=>document.getElementById('chart-of-accounts')?.scrollIntoView({behavior:'smooth'})}>Chart of Accounts</button>
          <button className="quiet" onClick={() => {api.clearMfaSession();void signOut().then(() => setAccount(null));}}>Sign out</button>
        </div>
      </header>

      <main>
        <section className="page-heading">
          <div><h1>Sales & Expenses</h1><p>{subscription?.subscription.displayName ?? 'Loading subscription…'}</p></div>
          <div className="heading-actions">{subscription?.capabilities.canPrepareTaxes&&<span className="role-badge">Accountant access</span>}
            {isFirmAdmin&&isBusinessWorkspace&&<button className="quiet" onClick={()=>{setInviteRole('accountant');setInviteCompanyIds(companyId?[companyId]:[]);const details=document.querySelector<HTMLDetailsElement>('.seat-management');if(details){details.open=true;details.scrollIntoView({behavior:'smooth'});}}}>Invite my accountant</button>}</div>
        </section>
        {error && <div className="banner error" role="alert">{error}</div>}
        {message && <div className="banner success" role="status">{message}</div>}

        {platformRole&&<details className="panel platform-management" open><summary><strong>{platformRole==='platform_admin'?'Apex Ledger administration':'Customer support'}</strong> — subscription management</summary>
          <div className="form-grid compact platform-controls"><label>Audit reason<input value={platformReason} onChange={(e)=>setPlatformReason(e.target.value)} maxLength={500}/></label><label>Renew through<input type="date" value={platformRenewalDate} onChange={(e)=>setPlatformRenewalDate(e.target.value)}/></label></div>
          <div className="table-wrap"><table><thead><tr><th>Firm</th><th>Plan</th><th>Seats</th><th>Status</th><th>Period end</th><th>Service actions</th></tr></thead><tbody>{platformSubscriptions.map((row)=><tr key={row.firmId}><td><strong>{row.firmName}</strong></td><td>{row.planName}</td><td>{row.seatLimit}</td><td><span className={`pill status-${row.status}`}>{row.status.replaceAll('_',' ')}</span></td><td>{row.currentPeriodEnd?.slice(0,10)??'—'}</td><td><div className="row-actions"><button className="quiet" disabled={busy} onClick={()=>void manageSubscription(row,'renew')}>Renew</button>{row.status==='suspended'?<button className="primary" disabled={busy} onClick={()=>void manageSubscription(row,'reactivate')}>Reactivate</button>:<button className="danger-button" disabled={busy} onClick={()=>void manageSubscription(row,'suspend')}>Stop service</button>}<button className="quiet" disabled={busy} onClick={()=>void manageSubscription(row,'mark_past_due')}>Past due</button></div></td></tr>)}</tbody></table></div>
          <p className="privacy-note">Every action records the staff identity, reason, before state and after state. Customer Support cannot cancel accounts or change plans; those actions require a platform administrator.</p>
          <details><summary><strong>Recent service history</strong> — read only</summary><div className="table-wrap"><table><thead><tr><th>Date</th><th>Firm</th><th>Action</th><th>Staff</th><th>Reason</th></tr></thead><tbody>{platformActions.map((item)=><tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.firmName}</td><td>{item.action.replaceAll('_',' ')}</td><td>{item.actorName}<small className="block-note">{item.actorEmail}</small></td><td>{item.reason}</td></tr>)}</tbody></table>{platformActions.length===0&&<p className="privacy-note">No service actions have been recorded.</p>}</div></details>
        </details>}

        {subscription?.capabilities.showAdvancedAccounting&&<section className="panel" id="chart-of-accounts"><div className="panel-title"><h2>Chart of Accounts</h2><span>Direct accounting navigation · internal codes stay hidden</span></div>
          <div className="account-tree">{accounts.map((item)=><div key={item.id} className={item.isMaster?'account-master':'account-child'}><span>{item.parentAccountId?'↳ ':''}{item.name}</span><small>{item.accountType.replace('_',' ')} · {item.accountKind.replaceAll('_',' ')}</small></div>)}</div>
        </section>}

        {isFirmAdmin&&seats&&<details className="panel seat-management"><summary><strong>{isBusinessWorkspace?'Users & accountant access':'Firm seats'}</strong> — {seats.occupiedSeats} active + {seats.pendingSeats} pending of {seats.seatLimit}</summary>
          <div className="seat-meter"><span style={{width:`${Math.min(100,(seats.occupiedSeats+seats.pendingSeats)*100/seats.seatLimit)}%`}}/></div>
          {isBusinessWorkspace&&<div className="accountant-access-note"><strong>Share your live books with your accountant</strong><span>Select “Can edit — accountant” and only the company they should review. They work in the same records; nothing is copied or transferred.</span></div>}
          <div className="form-grid compact">
            <label>Invite email<input type="email" value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)} placeholder="accountant@firm.ca"/></label>
            <label>Access permission<select value={inviteRole} onChange={(e)=>setInviteRole(e.target.value as Exclude<FirmRole,'owner'>)}><option value="accountant">Can edit — accountant</option><option value="bookkeeper">Can edit — bookkeeper</option><option value="firm_admin">Can edit and manage firm</option><option value="payroll">Payroll access only</option><option value="viewer">View only — cannot edit</option></select></label>
            <label className="action-label">Named access<button className="primary" disabled={busy||!inviteEmail.trim()||seats.occupiedSeats+seats.pendingSeats>=seats.seatLimit} onClick={()=>void inviteFirmSeat()}>{isBusinessWorkspace&&inviteRole==='accountant'?'Invite accountant':'Invite seat'}</button></label>
          </div>
          <fieldset className="client-access"><legend>Client company access</legend><p>{inviteRole==='firm_admin'?'Firm administrators can access every client company.':'Select only the client companies this person may open.'}</p>
            <div>{companies.map((company)=><label key={company.id}><input type="checkbox" disabled={inviteRole==='firm_admin'} checked={inviteRole==='firm_admin'||inviteCompanyIds.includes(company.id)} onChange={(e)=>setInviteCompanyIds((current)=>e.target.checked?[...current,company.id]:current.filter((id)=>id!==company.id))}/>{company.legalName}</label>)}</div>
          </fieldset>
          {seats.occupiedSeats+seats.pendingSeats>=seats.seatLimit&&<p className="privacy-note">The current seat limit is full. Request a larger limit below before inviting another person.</p>}
          {inviteLink&&<div className="invite-link"><span>Secure one-time acceptance link</span><input readOnly value={inviteLink}/><button className="quiet" onClick={()=>void navigator.clipboard.writeText(inviteLink)}>Copy link</button></div>}
          <div className="table-wrap mini-table"><table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Permission</th><th>Clients</th><th>Status</th><th></th></tr></thead><tbody>
            {seats.members.map((member)=><tr key={member.userId}><td>{member.displayName??'Named user'}</td><td>{member.email??'—'}</td><td>{member.role.replace('_',' ')}</td><td>{accessLabel(member.role)}</td><td>{member.role==='owner'||member.role==='firm_admin'?'All clients':member.companyNames.join(', ')||'None'}</td><td>{member.status}</td><td><div className="row-actions">{member.status==='active'&&member.role!=='owner'&&member.role!=='firm_admin'&&<button className="quiet" disabled={busy} onClick={()=>{setEditingSeatUserId(member.userId);setEditingSeatCompanyIds(member.companyIds);}}>Edit clients</button>}{member.status==='active'&&member.role!=='owner'&&<button className="danger-button" disabled={busy} onClick={()=>void suspendSeat(member.userId,member.displayName??member.email??'this user')}>Suspend</button>}</div></td></tr>)}
            {seats.invitations.map((invitation)=><tr key={invitation.id}><td>Pending invitation</td><td>{invitation.email}</td><td>{invitation.role.replace('_',' ')}</td><td>{accessLabel(invitation.role)}</td><td>{invitation.role==='firm_admin'?'All clients':invitation.companyNames.join(', ')||'None'}</td><td>Expires {invitation.expiresAt.slice(0,10)}</td><td><button className="danger-button" disabled={busy} onClick={()=>void revokeInvite(invitation.id)}>Cancel invite</button></td></tr>)}
          </tbody></table></div>
          {editingSeatUserId&&<fieldset className="client-access"><legend>Edit client access</legend><p>Select the client companies this team member may open.</p><div>{companies.map((company)=><label key={company.id}><input type="checkbox" checked={editingSeatCompanyIds.includes(company.id)} onChange={(e)=>setEditingSeatCompanyIds((current)=>e.target.checked?[...current,company.id]:current.filter((id)=>id!==company.id))}/>{company.legalName}</label>)}</div>
            <div className="inline-actions"><button className="quiet" onClick={()=>setEditingSeatUserId('')}>Cancel</button><button className="primary" disabled={busy} onClick={()=>void saveSeatClientAccess()}>Save client access</button></div></fieldset>}
          <div className="seat-growth"><div><strong>Plan for more staff</strong><p>Request a higher firm limit. Billing approval will activate the extra capacity; company files and audit history stay unchanged.</p></div>
            {seats.pendingSeatChange?<span className="role-badge">Requested {seats.pendingSeatChange.requestedSeatLimit} seats</span>:<><label>New total seats<input inputMode="numeric" value={requestedSeats} onChange={(e)=>setRequestedSeats(e.target.value)} placeholder={String(Math.max(seats.seatLimit+1,5))}/></label><button className="quiet" disabled={busy} onClick={()=>void requestSeatIncrease()}>Request more seats</button></>}
          </div>
        </details>}

        <section className="summary-grid" aria-label="Sales tax summary">
          <Summary label="Revenue before tax" value={summary.salesBaseCents} />
          <Summary label="HST collected" value={summary.hstCollectedCents} />
          <Summary label="Expenses before tax" value={summary.expenseBaseCents} />
          <Summary label="ITC paid" value={summary.itcPaidCents} />
          <Summary label="Net HST payable" value={summary.netHstPayableCents} emphasis />
        </section>
        {taxCategories.length>0&&<details className="tax-detail"><summary>Sales Tax detail by revenue and expense category</summary><div className="table-wrap"><table><thead><tr><th>Category</th><th>Source</th><th>Amount before tax</th><th>HST / ITC</th></tr></thead><tbody>
          {taxCategories.map((row)=><tr key={`${row.eventType}-${row.accountId}`}><td>{row.accountName}</td><td>{row.eventType==='sales_collected'?'HST collected':'ITC paid'}</td><td>{formatCad(row.baseCents)}</td><td>{formatCad(row.hstCents)}</td></tr>)}
        </tbody></table></div></details>}

        <section className="panel">
          <div className="panel-title"><h2>New entry</h2><span>Tax suggestion must be confirmed before saving.</span></div>
          <div className="type-switch">
            <button className={form.transactionType === 'sale' ? 'active sale' : ''} onClick={() => setForm({ ...form, transactionType: 'sale', categoryAccountId: '' })}>Sale / Income</button>
            <button className={form.transactionType === 'expense' ? 'active expense' : ''} onClick={() => setForm({ ...form, transactionType: 'expense', categoryAccountId: '' })}>Expense</button>
          </div>
          <div className="form-grid">
            <label>Date<input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} /></label>
            <label>Bank / card<select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}><option value="">Select…</option>{banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Category<select value={form.categoryAccountId} onChange={(e) => setForm({ ...form, categoryAccountId: e.target.value })}><option value="">Select…</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Customer / vendor<input value={form.counterpartyName} onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })} /></label>
            <label className="wide">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Office supplies" /></label>
            <label>Base amount<input inputMode="decimal" value={form.baseAmount} onChange={(e) => setForm({ ...form, baseAmount: e.target.value })} placeholder="0.00" /></label>
            <label>Tax<select value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value as FormState['taxCode'] })}><option value="hst_13">HST 13%</option><option value="hst_exempt">HST Exempt</option><option value="manual_hst">Manual HST</option></select></label>
            {form.taxCode === 'manual_hst' && <label>Manual HST<input inputMode="decimal" value={form.manualHstAmount} onChange={(e) => setForm({ ...form, manualHstAmount: e.target.value })} placeholder="0.00" /></label>}
          </div>
          {suggestion && <p className="suggestion">Suggested: {form.taxCode === 'hst_13' ? 'HST 13%' : 'HST Exempt'} — {suggestion}</p>}
          <div className="entry-footer"><div><span>HST {formatCad(hstCents)}</span><strong>Total {formatCad(totalCents)}</strong></div><button className="primary" disabled={!canEnter || busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save & Next'}</button></div>
        </section>

        <details className="panel transfer-panel"><summary><strong>Transfer between accounts</strong><span> Bank, savings or credit card</span></summary>
          <div className="form-grid compact transfer-grid">
            <label>Date<input type="date" value={transferForm.transferDate} onChange={(e)=>setTransferForm({...transferForm,transferDate:e.target.value})}/></label>
            <label>From<select value={transferForm.fromAccountId} onChange={(e)=>setTransferForm({...transferForm,fromAccountId:e.target.value,toAccountId:transferForm.toAccountId===e.target.value?'':transferForm.toAccountId})}><option value="">Select…</option>{banks.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>To<select value={transferForm.toAccountId} onChange={(e)=>setTransferForm({...transferForm,toAccountId:e.target.value})}><option value="">Select…</option>{banks.filter((item)=>item.id!==transferForm.fromAccountId).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Amount<input inputMode="decimal" value={transferForm.amount} onChange={(e)=>setTransferForm({...transferForm,amount:e.target.value})} placeholder="0.00"/></label>
            <label className="wide">Memo<input value={transferForm.memo} onChange={(e)=>setTransferForm({...transferForm,memo:e.target.value})} placeholder="Optional transfer note"/></label>
          </div><div className="inline-actions"><button className="primary" disabled={!canEnter||busy||banks.length<2} onClick={()=>void submitTransfer()}>Save transfer</button></div>
          {banks.length<2&&<p className="privacy-note">Add another bank or credit-card account before creating a transfer.</p>}
        </details>

        {subscription?.capabilities.showAdvancedAccounting&&<details className="panel transfer-panel"><summary><strong>Import bank or credit-card statement</strong><span> CSV review before posting</span></summary>
          <div className="form-grid compact transfer-grid">
            <label>Account<select value={bankImportAccountId} onChange={(e)=>setBankImportAccountId(e.target.value)}><option value="">Select…</option>{banks.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="wide">CSV statement<input type="file" accept=".csv,text/csv" onChange={(e)=>setBankImportFile(e.target.files?.[0]??null)}/></label>
            <label className="action-label">Secure staging<button className="primary" disabled={busy||!bankImportAccountId||!bankImportFile} onClick={()=>void submitBankImport()}>Scan & import</button></label>
          </div>
          <p className="privacy-note">Imported rows are staged as unmatched. Nothing is posted to the ledger until it is reviewed and matched.</p>
          <div className="table-wrap mini-table"><table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>
            {bankImportRows.map((row)=><tr key={row.id}><td>{row.postedDate}</td><td>{row.description}</td><td>{row.reference??'—'}</td><td>{formatCad(row.amountCents)}</td><td><span className="pill">{row.status}</span></td></tr>)}
          </tbody></table>{bankImportRows.length===0&&<p className="empty">No staged statement rows for this account.</p>}</div>
        </details>}

        {subscription?.capabilities.showAdvancedAccounting&&<section className="panel">
          <div className="panel-title"><h2>Invoices & customer payments</h2><button className="quiet" onClick={()=>setInvoiceFormOpen((open)=>!open)}>{invoiceFormOpen?'Close entry':'New invoice'}</button></div>
          {invoiceFormOpen&&<div className="invoice-entry">
            <div className="form-grid compact">
              <label>Customer<select value={invoiceForm.customerId} onChange={(e)=>setInvoiceForm({...invoiceForm,customerId:e.target.value})}><option value="">Select…</option>{customers.map((item)=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
              <label>Invoice date<input type="date" value={invoiceForm.invoiceDate} onChange={(e)=>setInvoiceForm({...invoiceForm,invoiceDate:e.target.value})}/></label>
              <label>Due date<input type="date" value={invoiceForm.dueDate} onChange={(e)=>setInvoiceForm({...invoiceForm,dueDate:e.target.value})}/></label>
              <label className="wide">Memo<input value={invoiceForm.memo} onChange={(e)=>setInvoiceForm({...invoiceForm,memo:e.target.value})}/></label>
            </div>
            {invoiceForm.lines.map((line,index)=><div className="invoice-line" key={index}><div className="form-grid compact">
              <label>Product/service<select value={line.productId} onChange={(e)=>selectProduct(index,e.target.value)}><option value="">Editable line</option>{products.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="wide">Description<input value={line.description} onChange={(e)=>updateInvoiceLine(index,{description:e.target.value})}/></label>
              <label>Quantity<input inputMode="decimal" value={line.quantity} onChange={(e)=>updateInvoiceLine(index,{quantity:e.target.value})}/></label>
              <label>Unit price<input inputMode="decimal" value={line.unitPrice} onChange={(e)=>updateInvoiceLine(index,{unitPrice:e.target.value})} placeholder="0.00"/></label>
              <label>Revenue account<select value={line.revenueAccountId} onChange={(e)=>updateInvoiceLine(index,{revenueAccountId:e.target.value})}>{revenueAccounts.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Tax<select value={line.taxCode} onChange={(e)=>updateInvoiceLine(index,{taxCode:e.target.value as InvoiceLineFormState['taxCode']})}><option value="hst_13">HST 13%</option><option value="hst_exempt">HST Exempt</option><option value="manual_hst">Manual HST</option></select></label>
              {line.taxCode==='manual_hst'&&<label>Manual HST<input inputMode="decimal" value={line.manualHstAmount} onChange={(e)=>updateInvoiceLine(index,{manualHstAmount:e.target.value})}/></label>}
            </div>{invoiceForm.lines.length>1&&<button className="quiet remove-line" onClick={()=>setInvoiceForm((current)=>({...current,lines:current.lines.filter((_,lineIndex)=>lineIndex!==index)}))}>Remove line</button>}</div>)}
            <button className="quiet" onClick={()=>setInvoiceForm((current)=>({...current,lines:[...current.lines,emptyInvoiceLine(revenueAccounts[0]?.id??'')]}))}>+ Add line</button>
            <div className="entry-footer"><div><span>Subtotal {formatCad(invoiceTotals.base)}</span><span>HST {formatCad(invoiceTotals.hst)}</span><strong>Total {formatCad(invoiceTotals.base+invoiceTotals.hst)}</strong></div>
              <button className="quiet" disabled={busy} onClick={()=>void submitInvoice(true)}>Save & Close</button><button className="primary" disabled={busy} onClick={()=>void submitInvoice(false)}>Save & Next</button></div>
          </div>}
          <details className="contact-create"><summary>New product or service</summary><div className="form-grid compact">
            <label>Type<select value={productForm.itemType} onChange={(e)=>setProductForm({...productForm,itemType:e.target.value as 'product'|'service'})}><option value="service">Service</option><option value="product">Product</option></select></label>
            <label>Name<input value={productForm.name} onChange={(e)=>setProductForm({...productForm,name:e.target.value})}/></label>
            <label>SKU<input value={productForm.sku} onChange={(e)=>setProductForm({...productForm,sku:e.target.value})}/></label>
            <label>Price<input inputMode="decimal" value={productForm.unitPrice} onChange={(e)=>setProductForm({...productForm,unitPrice:e.target.value})}/></label>
            <label>Revenue account<select value={productForm.revenueAccountId} onChange={(e)=>setProductForm({...productForm,revenueAccountId:e.target.value})}>{revenueAccounts.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Tax<select value={productForm.defaultTaxCode} onChange={(e)=>setProductForm({...productForm,defaultTaxCode:e.target.value as typeof productForm.defaultTaxCode})}><option value="hst_13">HST 13%</option><option value="hst_exempt">HST Exempt</option><option value="manual_hst">Manual HST</option></select></label>
            <label className="wide">Description<input value={productForm.description} onChange={(e)=>setProductForm({...productForm,description:e.target.value})}/></label>
          </div><div className="inline-actions">{editingProduct&&<button className="quiet" onClick={()=>{setEditingProduct(null);setProductForm({...initialProduct,revenueAccountId:productForm.revenueAccountId});}}>Cancel edit</button>}
            <button className="primary" disabled={busy} onClick={()=>void submitProduct()}>{editingProduct?'Save changes':'Save & Next'}</button></div>
            <div className="table-wrap mini-table"><table><thead><tr><th>Name</th><th>Type</th><th>Price</th><th>Tax</th><th></th></tr></thead><tbody>{products.map((item)=><tr key={item.id}><td>{item.name}</td><td>{item.itemType}</td><td>{formatCad(item.unitPriceCents)}</td><td>{item.defaultTaxCode.replaceAll('_',' ')}</td><td><button className="quiet" onClick={()=>editProduct(item)}>Edit</button></td></tr>)}</tbody></table></div>
          </details>
          <div className="table-wrap invoice-table"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Subtotal</th><th>HST</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
            {invoices.map((row)=><tr key={row.id}><td><strong>INV-{row.invoiceNumber.padStart(6,'0')}</strong></td><td>{row.invoiceDate}</td><td>{row.customerName}</td><td>{formatCad(row.subtotalCents)}</td><td>{formatCad(row.hstCents)}</td><td>{formatCad(row.totalCents)}</td><td>{formatCad(row.balanceCents)}</td><td>{row.status.replace('_',' ')}</td><td><div className="row-actions"><button className="quiet" onClick={()=>void copyInvoice(row.id)}>Copy</button>{Number(row.balanceCents)>0&&row.status!=='voided'&&<button className="quiet" disabled={busy} onClick={()=>void receiveFullPayment(row)}>Receive payment</button>}{row.status==='posted'&&row.balanceCents===row.totalCents&&<button className="danger-button" disabled={busy} onClick={()=>void voidInvoice(row)}>Void</button>}</div></td></tr>)}
          </tbody></table>{invoices.length===0&&<p className="empty">No invoices yet.</p>}</div>
        </section>}

        {subscription?.capabilities.showAdvancedAccounting&&<section className="panel">
          <div className="panel-title"><h2>Bills & vendor payments</h2><button className="quiet" onClick={()=>setBillFormOpen((open)=>!open)}>{billFormOpen?'Close entry':'New bill'}</button></div>
          {billFormOpen&&<div className="invoice-entry">
            <div className="form-grid compact">
              <label>Vendor<select value={billForm.vendorId} onChange={(e)=>setBillForm({...billForm,vendorId:e.target.value})}><option value="">Select…</option>{vendors.map((item)=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
              <label>Supplier invoice #<input value={billForm.vendorInvoiceNumber} onChange={(e)=>setBillForm({...billForm,vendorInvoiceNumber:e.target.value})}/></label>
              <label>Bill date<input type="date" value={billForm.billDate} onChange={(e)=>setBillForm({...billForm,billDate:e.target.value})}/></label>
              <label>Due date<input type="date" value={billForm.dueDate} onChange={(e)=>setBillForm({...billForm,dueDate:e.target.value})}/></label>
              <label className="wide">Memo<input value={billForm.memo} onChange={(e)=>setBillForm({...billForm,memo:e.target.value})}/></label>
            </div>
            {billForm.lines.map((line,index)=><div className="invoice-line" key={index}><div className="form-grid compact">
              <label className="wide">Description<input value={line.description} onChange={(e)=>updateBillLine(index,{description:e.target.value})}/></label>
              <label>Expense account<select value={line.expenseAccountId} onChange={(e)=>updateBillLine(index,{expenseAccountId:e.target.value})}>{expenseAccounts.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Base amount<input inputMode="decimal" value={line.baseAmount} onChange={(e)=>updateBillLine(index,{baseAmount:e.target.value})} placeholder="0.00"/></label>
              <label>Tax<select value={line.taxCode} onChange={(e)=>updateBillLine(index,{taxCode:e.target.value as BillLineFormState['taxCode']})}><option value="hst_13">HST 13%</option><option value="hst_exempt">HST Exempt</option><option value="manual_hst">Manual HST</option></select></label>
              {line.taxCode==='manual_hst'&&<label>Manual HST<input inputMode="decimal" value={line.manualHstAmount} onChange={(e)=>updateBillLine(index,{manualHstAmount:e.target.value})}/></label>}
            </div>{billForm.lines.length>1&&<button className="quiet remove-line" onClick={()=>setBillForm((current)=>({...current,lines:current.lines.filter((_,lineIndex)=>lineIndex!==index)}))}>Remove line</button>}</div>)}
            <button className="quiet" onClick={()=>setBillForm((current)=>({...current,lines:[...current.lines,emptyBillLine(expenseAccounts[0]?.id??'')]}))}>+ Add line</button>
            <div className="entry-footer"><div><span>Subtotal {formatCad(billTotals.base)}</span><span>HST / ITC {formatCad(billTotals.hst)}</span><strong>Total {formatCad(billTotals.base+billTotals.hst)}</strong></div>
              <button className="quiet" disabled={busy} onClick={()=>void submitBill(true)}>Save & Close</button><button className="primary" disabled={busy} onClick={()=>void submitBill(false)}>Save & Next</button></div>
          </div>}
          <div className="table-wrap invoice-table"><table><thead><tr><th>Bill</th><th>Supplier invoice</th><th>Date</th><th>Vendor</th><th>Subtotal</th><th>HST / ITC</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
            {bills.map((row)=><tr key={row.id}><td><strong>BILL-{row.billNumber.padStart(6,'0')}</strong></td><td>{row.vendorInvoiceNumber}</td><td>{row.billDate}</td><td>{row.vendorName}</td><td>{formatCad(row.subtotalCents)}</td><td>{formatCad(row.hstCents)}</td><td>{formatCad(row.totalCents)}</td><td>{formatCad(row.balanceCents)}</td><td>{row.status.replace('_',' ')}</td><td><div className="row-actions"><button className="quiet" onClick={()=>void copyBill(row.id)}>Copy</button>{Number(row.balanceCents)>0&&row.status!=='voided'&&<button className="quiet" disabled={busy} onClick={()=>void payBill(row)}>Pay bill</button>}{row.status==='posted'&&row.balanceCents===row.totalCents&&<button className="danger-button" disabled={busy} onClick={()=>void voidBill(row)}>Void</button>}</div></td></tr>)}
          </tbody></table>{bills.length===0&&<p className="empty">No bills yet.</p>}</div>
        </section>}

        <section className="panel">
          <div className="panel-title"><h2>Recent entries</h2><span>{transactions.length} entries this year</span></div>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Customer / vendor</th><th>Base</th><th>HST</th><th>Total</th></tr></thead>
            <tbody>{transactions.map((row) => <tr key={row.id}><td>{row.transactionDate}</td><td><span className={`pill ${row.transactionType}`}>{row.transactionType}</span></td><td>{row.description}</td><td>{row.counterpartyName ?? '—'}</td><td>{formatCad(row.baseCents)}</td><td>{formatCad(row.hstCents)}</td><td><strong>{formatCad(row.totalCents)}</strong></td></tr>)}</tbody>
          </table>{transactions.length === 0 && <p className="empty">No entries in this date range.</p>}</div>
        </section>

        <section className="panel">
          <div className="panel-title"><h2>Customers & vendors</h2><span>Company-only directory · {contacts.length} shown</span></div>
          <div className="contact-tools">
            <label>Search<input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Name, company, phone, address, DOB or exact SIN" /></label>
            <label>Type<select value={contactType} onChange={(e) => setContactType(e.target.value)}><option value="">All</option><option value="customer">Customers</option><option value="vendor">Vendors</option></select></label>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Company</th><th>Phone</th><th>Email</th><th>Protected ID</th></tr></thead>
            <tbody>{contacts.map((row) => <tr key={row.id}><td><strong>{row.displayName}</strong></td><td>{row.contactType}</td><td>{row.companyName ?? '—'}</td><td>{row.phone ?? '—'}</td><td>{row.email ?? '—'}</td><td>{row.hasSin ? `SIN ending ${row.sinLastFour ?? '••••'}` : '—'}</td></tr>)}</tbody>
          </table>{contacts.length === 0 && <p className="empty">No matching customers or vendors.</p>}</div>
          <details className="contact-create"><summary>Add customer or vendor</summary>
            <div className="form-grid compact">
              <label>Type<select value={contactForm.contactType} onChange={(e) => setContactForm({ ...contactForm, contactType: e.target.value as ContactFormState['contactType'] })}><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="both">Both</option></select></label>
              <label>Entity<select value={contactForm.entityType} onChange={(e) => setContactForm({ ...contactForm, entityType: e.target.value as 'business' | 'person' })}><option value="business">Business</option><option value="person">Person</option></select></label>
              <label>Name<input value={contactForm.displayName} onChange={(e) => setContactForm({ ...contactForm, displayName: e.target.value })} /></label>
              <label>Company<input value={contactForm.companyName} onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })} /></label>
              <label>Email<input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></label>
              <label>Phone<input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></label>
              <label>Address<input value={contactForm.addressLine1} onChange={(e) => setContactForm({ ...contactForm, addressLine1: e.target.value })} /></label>
              <label>City<input value={contactForm.city} onChange={(e) => setContactForm({ ...contactForm, city: e.target.value })} /></label>
              <label>Province<input value={contactForm.province} onChange={(e) => setContactForm({ ...contactForm, province: e.target.value })} /></label>
              <label>Postal code<input value={contactForm.postalCode} onChange={(e) => setContactForm({ ...contactForm, postalCode: e.target.value })} /></label>
              <label>Date of birth<input type="date" value={contactForm.dateOfBirth} onChange={(e) => setContactForm({ ...contactForm, dateOfBirth: e.target.value })} /></label>
              <label>SIN (optional)<input value={contactForm.sin} onChange={(e) => setContactForm({ ...contactForm, sin: e.target.value })} autoComplete="off" /></label>
            </div>
            <p className="privacy-note">SIN is validated, converted to a protected exact-search key, and never returned in full.</p>
            <button className="primary" disabled={busy} onClick={() => void submitContact()}>Save & Next</button>
          </details>
        </section>
      </main>
    </div>
  );
}

function Summary({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <article className={emphasis ? 'summary emphasis' : 'summary'}><span>{label}</span><strong>{formatCad(value)}</strong></article>;
}

function moneyToCents(value: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(value.trim())) return 0;
  const [dollars, fraction = ''] = value.trim().split('.');
  return Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
}

function quantityToMilli(value:string):number{
  if(!/^\d+(\.\d{0,3})?$/.test(value.trim()))return 0;const [whole,fraction='']=value.trim().split('.');return Number(whole)*1000+Number(fraction.padEnd(3,'0'));
}

function centsToInput(value:string):string{return (Number(value)/100).toFixed(2);}
function milliToInput(value:string):string{const numeric=Number(value)/1000;return Number.isInteger(numeric)?String(numeric):numeric.toFixed(3).replace(/0+$/,'');}
function accessLabel(role:FirmRole):string{if(role==='viewer')return'View only';if(role==='payroll')return'Payroll only';return'Can edit';}
