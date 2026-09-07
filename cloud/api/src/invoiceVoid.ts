import { createHash } from 'node:crypto';

export interface InvoiceVoidInput { voidDate:string;reason:string }
export class InvoiceVoidValidationError extends Error{constructor(message:string){super(message);this.name='InvoiceVoidValidationError';}}
export function validateInvoiceVoid(input:InvoiceVoidInput):void{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.voidDate))throw new InvoiceVoidValidationError('void date is invalid');
  if(input.reason.trim().length<3)throw new InvoiceVoidValidationError('void reason must explain the correction');
}
export function hashInvoiceVoidRequest(companyId:string,invoiceId:string,input:InvoiceVoidInput):string{
  validateInvoiceVoid(input);return createHash('sha256').update(JSON.stringify({companyId,invoiceId,voidDate:input.voidDate,reason:input.reason.trim()})).digest('hex');
}
