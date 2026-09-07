import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerPaymentValidationError, hashCustomerPaymentRequest, validateCustomerPayment } from './customerPayment.js';

describe('customer payment validation', () => {
  const input = { paymentDate:'2026-08-29',amountCents:11300,bankAccountId:'8bbaf352-720e-420c-93ef-672f5cc7cb84' };
  it('accepts exact positive cents and hashes the invoice allocation',()=>{
    assert.doesNotThrow(()=>validateCustomerPayment(input));
    assert.equal(hashCustomerPaymentRequest('company','invoice',input),hashCustomerPaymentRequest('company','invoice',input));
    assert.notEqual(hashCustomerPaymentRequest('company','invoice',input),hashCustomerPaymentRequest('company','another',input));
  });
  it('rejects zero, negative and fractional payments',()=>{
    for(const amountCents of [0,-1,10.5]) assert.throws(()=>validateCustomerPayment({...input,amountCents}),CustomerPaymentValidationError);
  });
});
