import { describe, expect, it } from 'vitest';
import { isOfxContent, ofxAccountHint, parseOfx } from './parseOfx';

const ZONE = ['[', '-4', ':EDT', ']'].join('');
const SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>CAD
<BANKACCTFROM><BANKID>000400123<ACCTID>5566731<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260903120000.000${ZONE}
<TRNAMT>-56.50
<FITID>2026090300123
<NAME>STAPLES #45
<MEMO>STAPLES #45 TORONTO ON
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260904
<TRNAMT>1,350.00
<FITID>2026090400777
<NAME>E-TRANSFER MAPLE CONSULTING
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260904
<TRNAMT>-56.50
<FITID>2026090300123
<NAME>STAPLES #45
</STMTTRN>
<STMTTRN>
<DTPOSTED>bad
<TRNAMT>-10.00
<NAME>NO DATE
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('OFX / QFX bank downloads', () => {
  it('recognises the format from the header or the transaction tags', () => {
    expect(isOfxContent(SAMPLE)).toBe(true);
    expect(isOfxContent('Date,Description,Amount\n2026-09-03,Staples,-56.50')).toBe(false);
  });

  it('reads date, signed amount and a merged payee/memo from each transaction', () => {
    const result = parseOfx(SAMPLE);
    expect(result.rows.map((r) => [r.date, r.amountCents, r.description])).toEqual([
      ['2026-09-03', -5650, 'STAPLES #45 TORONTO ON'],
      ['2026-09-04', 135000, 'E-TRANSFER MAPLE CONSULTING'],
    ]);
  });

  it('drops a repeated bank transaction id instead of importing it twice', () => {
    expect(parseOfx(SAMPLE).rows.filter((r) => r.description.startsWith('STAPLES'))).toHaveLength(1);
  });

  it('lists a transaction without a usable date for hand entry rather than losing it', () => {
    const result = parseOfx(SAMPLE);
    expect(result.skipped).toBe(1);
    expect(result.skippedRows[0].descriptionGuess).toBe('NO DATE');
    expect(result.skippedRows[0].amountGuessCents).toBe(1000);
  });

  it('names the account the file came from', () => {
    expect(ofxAccountHint(SAMPLE)).toBe('000400123 checking …6731');
  });
});
