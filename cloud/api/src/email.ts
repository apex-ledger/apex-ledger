import type{AppConfig}from'./config.js';
export interface EmailSender{sendSecurityCode(input:{to:string;code:string;expiresMinutes:number}):Promise<void>}
export class HttpEmailSender implements EmailSender{constructor(private readonly config:AppConfig){}
  async sendSecurityCode(input:{to:string;code:string;expiresMinutes:number}):Promise<void>{if(!this.config.EMAIL_DELIVERY_URL)throw new Error('email_delivery_not_configured');
    const response=await fetch(this.config.EMAIL_DELIVERY_URL,{method:'POST',headers:{'content-type':'application/json',...(this.config.EMAIL_DELIVERY_BEARER_TOKEN?{authorization:`Bearer ${this.config.EMAIL_DELIVERY_BEARER_TOKEN}`}:{})},
      body:JSON.stringify({from:this.config.EMAIL_FROM_ADDRESS,to:input.to,template:'apex-ledger-security-code',subject:'Your Apex Ledger security code',parameters:{code:input.code,expiresMinutes:input.expiresMinutes}})});
    if(!response.ok)throw new Error('email_delivery_failed');}}
