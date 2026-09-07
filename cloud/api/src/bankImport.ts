import{createHash}from'node:crypto';

export interface ParsedBankRow{postedDate:string;description:string;reference?:string;externalTransactionId?:string;amountCents:number;dedupHash:string}
export class BankImportValidationError extends Error{constructor(message:string){super(message);this.name='BankImportValidationError';}}

function splitCsvLine(line:string):string[]{const values:string[]=[];let value='';let quoted=false;for(let index=0;index<line.length;index++){const character=line[index];
  if(character==='"'){if(quoted&&line[index+1]==='"'){value+='"';index++;}else quoted=!quoted;}else if(character===','&&!quoted){values.push(value.trim());value='';}else value+=character;}
  if(quoted)throw new BankImportValidationError('unterminated_csv_quote');values.push(value.trim());return values;}
function parseMoney(value:string):number{const normalized=value.trim().replace(/^\$/,'').replaceAll(',','');if(!/^-?\d+(\.\d{1,2})?$/.test(normalized))throw new BankImportValidationError('invalid_bank_amount');
  const negative=normalized.startsWith('-');const [whole,fraction='']=normalized.replace('-','').split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return negative?-cents:cents;}
function normalizeDate(value:string):string{const trimmed=value.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(trimmed))return trimmed;const match=trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if(!match)throw new BankImportValidationError('invalid_bank_date');return`${match[3]}-${match[1]!.padStart(2,'0')}-${match[2]!.padStart(2,'0')}`;}

export function parseBankCsv(accountId:string,content:string):{contentSha256:string;rows:ParsedBankRow[]}{if(!content.trim())throw new BankImportValidationError('empty_bank_file');const lines=content.replace(/^\uFEFF/,'').split(/\r?\n/).filter((line)=>line.trim());
  if(lines.length<2||lines.length>5001)throw new BankImportValidationError('invalid_bank_row_count');const headers=splitCsvLine(lines[0]!).map((value)=>value.toLowerCase().replaceAll(/[^a-z0-9]/g,''));
  const column=(...names:string[])=>headers.findIndex((header)=>names.includes(header));const dateIndex=column('date','posteddate','transactiondate');const descriptionIndex=column('description','details','memo','payee');const amountIndex=column('amount');
  const debitIndex=column('debit','withdrawal');const creditIndex=column('credit','deposit');const referenceIndex=column('reference','ref','chequenumber','checknumber');const externalIndex=column('transactionid','externalid','fitid');
  if(dateIndex<0||descriptionIndex<0||amountIndex<0&&debitIndex<0&&creditIndex<0)throw new BankImportValidationError('required_bank_columns_missing');
  const rows=lines.slice(1).map((line)=>{const cells=splitCsvLine(line);const postedDate=normalizeDate(cells[dateIndex]??'');const description=(cells[descriptionIndex]??'').trim();if(!description)throw new BankImportValidationError('bank_description_required');
    let amountCents=amountIndex>=0?parseMoney(cells[amountIndex]??''):(creditIndex>=0&&cells[creditIndex]?.trim()?parseMoney(cells[creditIndex]!):-parseMoney(cells[debitIndex]??''));if(amountCents===0)throw new BankImportValidationError('zero_bank_amount');
    const reference=referenceIndex>=0?(cells[referenceIndex]??'').trim()||undefined:undefined;const externalTransactionId=externalIndex>=0?(cells[externalIndex]??'').trim()||undefined:undefined;
    const dedupHash=createHash('sha256').update(JSON.stringify({accountId,postedDate,description:description.toLowerCase().replaceAll(/\s+/g,' '),reference:reference?.toLowerCase()??null,externalTransactionId:externalTransactionId??null,amountCents})).digest('hex');
    return{postedDate,description,...(reference?{reference}:{}),...(externalTransactionId?{externalTransactionId}:{}),amountCents,dedupHash};});
  return{contentSha256:createHash('sha256').update(content).digest('hex'),rows};}
