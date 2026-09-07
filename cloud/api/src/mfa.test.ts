import assert from'node:assert/strict';import{describe,it}from'node:test';import{hashEmailOtp,issueMfaSession,maskEmail,verifyMfaSession}from'./mfa.js';
describe('email two-factor security',()=>{const secret='test-mfa-secret-that-is-longer-than-32-characters';
  it('binds a code hash to its user and challenge',()=>{assert.notEqual(hashEmailOtp(secret,'user-a:challenge','123456'),hashEmailOtp(secret,'user-b:challenge','123456'));});
  it('issues a short-lived session that cannot be used by another identity',async()=>{const token=await issueMfaSession(secret,'oid-a');assert.equal(await verifyMfaSession(secret,token,'oid-a'),true);assert.equal(await verifyMfaSession(secret,token,'oid-b'),false);});
  it('does not reveal most of the destination email',()=>assert.equal(maskEmail('accountant@example.ca'),'a******@example.ca'));
});
