import assert from 'node:assert/strict';import{describe,it}from'node:test';
import{hashInvoiceVoidRequest,InvoiceVoidValidationError,validateInvoiceVoid}from'./invoiceVoid.js';
describe('invoice void validation',()=>{
  const input={voidDate:'2026-08-30',reason:'Customer canceled duplicate invoice'};
  it('requires a dated reason and binds idempotency to the invoice',()=>{assert.doesNotThrow(()=>validateInvoiceVoid(input));assert.notEqual(hashInvoiceVoidRequest('c','i',input),hashInvoiceVoidRequest('c','other',input));});
  it('rejects unexplained voids',()=>assert.throws(()=>validateInvoiceVoid({...input,reason:'x'}),InvoiceVoidValidationError));
});
