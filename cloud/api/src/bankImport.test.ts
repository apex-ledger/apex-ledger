import assert from'node:assert/strict';import{describe,it}from'node:test';import{BankImportValidationError,parseBankCsv}from'./bankImport.js';
describe('bank CSV import',()=>{
  it('parses quoted rows and exact signed cents',()=>{const result=parseBankCsv('account-a','Date,Description,Amount,Reference\n08/29/2026,"Office, Supplies",-125.25,R-1\n2026-08-30,Deposit,500.00,R-2');
    assert.deepEqual(result.rows.map((row)=>({date:row.postedDate,description:row.description,amount:row.amountCents})),[{date:'2026-08-29',description:'Office, Supplies',amount:-12525},{date:'2026-08-30',description:'Deposit',amount:50000}]);assert.match(result.contentSha256,/^[0-9a-f]{64}$/);});
  it('supports separate debit and credit columns and rejects missing columns',()=>{const result=parseBankCsv('account-a','Date,Description,Debit,Credit\n2026-08-29,Fee,10.00,\n2026-08-30,Refund,,5.00');assert.deepEqual(result.rows.map((row)=>row.amountCents),[-1000,500]);
    assert.throws(()=>parseBankCsv('account-a','Name,Value\nA,1'),BankImportValidationError);});
});
