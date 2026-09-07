import assert from'node:assert/strict';import{describe,it}from'node:test';import{calculateVendorBill,hashVendorBillRequest,VendorBillCalculationError}from'./vendorBillCalculation.js';
describe('vendor bill calculation',()=>{const line={description:'Office supplies',expenseAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84',taxCode:'hst_13' as const,baseCents:157500};
  it('calculates recoverable HST and total',()=>{const bill=calculateVendorBill([line]);assert.deepEqual({subtotal:bill.subtotalCents,hst:bill.hstCents,total:bill.totalCents},{subtotal:157500,hst:20475,total:177975});});
  it('rejects empty bills and hashes normalized supplier numbers',()=>{assert.throws(()=>calculateVendorBill([]),VendorBillCalculationError);const input={vendorId:'v',vendorInvoiceNumber:' inv-1 ',billDate:'2026-08-30',dueDate:'2026-09-29',lines:[line]};
    assert.equal(hashVendorBillRequest('c',input),hashVendorBillRequest('c',{...input,vendorInvoiceNumber:'INV-1'}));});
});
