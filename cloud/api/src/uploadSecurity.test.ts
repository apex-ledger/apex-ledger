import assert from'node:assert/strict';import{describe,it}from'node:test';import{inspectBankCsvUpload,UnsafeUploadError}from'./uploadSecurity.js';
describe('statement upload security',()=>{it('accepts a plain CSV statement',()=>assert.doesNotThrow(()=>inspectBankCsvUpload('bank.csv','Date,Description,Amount\n2026-08-31,Sale,10.00')));
  it('rejects executable, active, and known test-malware content',()=>{for(const[name,content]of[['bank.exe','Date,Amount'],['bank.csv','MZpayload'],['bank.csv','<script>alert(1)</script>'],['bank.csv','EICAR-STANDARD-ANTIVIRUS-TEST-FILE']])
    assert.throws(()=>inspectBankCsvUpload(name!,content!),UnsafeUploadError);});});
