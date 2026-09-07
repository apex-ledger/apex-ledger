import assert from'node:assert/strict';import{describe,it}from'node:test';import{BankTransferValidationError,hashBankTransferRequest,validateBankTransfer}from'./bankTransfer.js';
const input={transferDate:'2026-08-30',fromAccountId:'10000000-0000-4000-8000-000000000001',toAccountId:'10000000-0000-4000-8000-000000000002',amountCents:250000,memo:'Card payment'};
describe('bank transfer validation',()=>{
  it('accepts exact cents and creates a stable company-bound hash',()=>{validateBankTransfer(input);assert.equal(hashBankTransferRequest('company-a',input),hashBankTransferRequest('company-a',{...input}));assert.notEqual(hashBankTransferRequest('company-a',input),hashBankTransferRequest('company-b',input));});
  it('rejects the same account and invalid cents',()=>{assert.throws(()=>validateBankTransfer({...input,toAccountId:input.fromAccountId}),BankTransferValidationError);assert.throws(()=>validateBankTransfer({...input,amountCents:1.2}),BankTransferValidationError);});
});
