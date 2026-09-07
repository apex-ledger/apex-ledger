import {createHash}from'node:crypto';

export interface BankTransferInput{transferDate:string;fromAccountId:string;toAccountId:string;amountCents:number;memo?:string}
export class BankTransferValidationError extends Error{constructor(message='invalid_bank_transfer'){super(message);this.name='BankTransferValidationError';}}
export function validateBankTransfer(input:BankTransferInput):void{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.transferDate))throw new BankTransferValidationError('invalid_transfer_date');
  if(input.fromAccountId===input.toAccountId)throw new BankTransferValidationError('transfer_accounts_must_differ');
  if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw new BankTransferValidationError('invalid_transfer_amount');
}
export function hashBankTransferRequest(companyId:string,input:BankTransferInput):string{return createHash('sha256').update(JSON.stringify({companyId,transferDate:input.transferDate,
  fromAccountId:input.fromAccountId,toAccountId:input.toAccountId,amountCents:input.amountCents,memo:input.memo?.trim()||null})).digest('hex');}
