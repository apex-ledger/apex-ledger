import assert from'node:assert/strict';import{describe,it}from'node:test';import{hashVendorPaymentRequest,validateVendorPayment,VendorPaymentValidationError}from'./vendorPayment.js';
describe('vendor payment validation',()=>{const input={paymentDate:'2026-08-30',amountCents:177975,bankAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84'};
  it('accepts exact cents and binds the payment to its bill',()=>{assert.doesNotThrow(()=>validateVendorPayment(input));assert.notEqual(hashVendorPaymentRequest('c','b',input),hashVendorPaymentRequest('c','other',input));});
  it('rejects invalid amounts',()=>assert.throws(()=>validateVendorPayment({...input,amountCents:0}),VendorPaymentValidationError));});
