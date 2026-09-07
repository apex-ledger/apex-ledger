import{createHash}from'node:crypto';
export interface VendorPaymentInput{paymentDate:string;amountCents:number;bankAccountId:string;reference?:string}
export class VendorPaymentValidationError extends Error{constructor(message:string){super(message);this.name='VendorPaymentValidationError';}}
export function validateVendorPayment(input:VendorPaymentInput):void{if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw new VendorPaymentValidationError('payment amount must be positive whole cents');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate))throw new VendorPaymentValidationError('payment date is invalid');}
export function hashVendorPaymentRequest(companyId:string,billId:string,input:VendorPaymentInput):string{validateVendorPayment(input);return createHash('sha256').update(JSON.stringify({companyId,billId,
  paymentDate:input.paymentDate,amountCents:input.amountCents,bankAccountId:input.bankAccountId,reference:input.reference?.trim()||null})).digest('hex');}
