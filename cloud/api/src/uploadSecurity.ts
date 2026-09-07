export class UnsafeUploadError extends Error{constructor(message:string){super(message);this.name='UnsafeUploadError';}}
export function inspectBankCsvUpload(sourceName:string,content:string):void{const normalized=sourceName.trim().toLowerCase();
  if(!normalized.endsWith('.csv'))throw new UnsafeUploadError('unsupported_statement_file_type');
  if(content.length>900_000)throw new UnsafeUploadError('statement_file_too_large');
  if(content.includes('\0')||content.startsWith('MZ')||content.startsWith('PK\u0003\u0004'))throw new UnsafeUploadError('binary_statement_rejected');
  if(content.toUpperCase().includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))throw new UnsafeUploadError('malware_signature_detected');
  if(/<script\b|<iframe\b|<object\b/i.test(content))throw new UnsafeUploadError('active_content_rejected');
}
