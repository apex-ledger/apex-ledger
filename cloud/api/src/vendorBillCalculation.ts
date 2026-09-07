import{createHash}from'node:crypto';import{calculateHst,type HstCode}from'./hstCalculation.js';
export interface VendorBillLineInput{description:string;expenseAccountId:string;taxCode:HstCode;baseCents:number;manualHstCents?:number}
export interface CalculatedVendorBillLine extends VendorBillLineInput{lineNumber:number;hstCents:number;totalCents:number}
export interface CalculatedVendorBill{lines:CalculatedVendorBillLine[];subtotalCents:number;hstCents:number;totalCents:number}
export class VendorBillCalculationError extends Error{constructor(message:string){super(message);this.name='VendorBillCalculationError';}}
export function calculateVendorBill(lines:VendorBillLineInput[]):CalculatedVendorBill{
  if(lines.length<1||lines.length>500)throw new VendorBillCalculationError('bill requires 1 to 500 lines');let subtotalCents=0,hstCents=0;
  const calculated=lines.map((line,index)=>{if(!line.description.trim())throw new VendorBillCalculationError('line description is required');
    const tax=calculateHst(line.baseCents,line.taxCode,line.manualHstCents);subtotalCents+=tax.baseCents;hstCents+=tax.hstCents;
    if(!Number.isSafeInteger(subtotalCents)||!Number.isSafeInteger(hstCents))throw new VendorBillCalculationError('bill total exceeds the supported range');
    return{...line,lineNumber:index+1,hstCents:tax.hstCents,totalCents:tax.totalCents};});
  const totalCents=subtotalCents+hstCents;if(!Number.isSafeInteger(totalCents))throw new VendorBillCalculationError('bill total exceeds the supported range');
  return{lines:calculated,subtotalCents,hstCents,totalCents};
}
export function hashVendorBillRequest(companyId:string,input:{vendorId:string;vendorInvoiceNumber:string;billDate:string;dueDate:string;memo?:string;lines:VendorBillLineInput[]}):string{
  const calculated=calculateVendorBill(input.lines);return createHash('sha256').update(JSON.stringify({companyId,vendorId:input.vendorId,vendorInvoiceNumber:input.vendorInvoiceNumber.trim().toUpperCase(),
    billDate:input.billDate,dueDate:input.dueDate,memo:input.memo?.trim()||null,lines:calculated.lines.map((line)=>({description:line.description.trim(),expenseAccountId:line.expenseAccountId,
      taxCode:line.taxCode,baseCents:line.baseCents,hstCents:line.hstCents,totalCents:line.totalCents}))})).digest('hex');
}
