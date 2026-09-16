import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CraNumberFields, type CraNumbers } from './CraNumberFields';
import { companyUpdateSchema } from '@shared/validation/schemas';

function Harness({ initial }: { initial: CraNumbers }) {
  const [values, setValues] = useState(initial);
  return (<><CraNumberFields values={values} onChange={setValues} /><output>{JSON.stringify(values)}</output></>);
}
const read = () => JSON.parse(screen.getByRole('status').textContent ?? '{}') as CraNumbers;
const blank = { businessNumber: '', hstNumber: '', payrollNumber: '', corporateTaxNumber: '' };

describe('CRA number boxes', () => {
  it('takes all nine digits even when typed with spaces, and fixes RT, RP and RC', async () => {
    render(<Harness initial={blank} />);
    await userEvent.type(screen.getByLabelText('Business Number'), '78322 1005');
    expect(read().businessNumber).toBe('783221005');
    await userEvent.type(screen.getByLabelText('GST/HST account reference'), '0001');
    await userEvent.type(screen.getByLabelText('Payroll account reference'), '0001');
    await userEvent.type(screen.getByLabelText('Corporate income tax account reference'), '0002');
    expect(read()).toEqual({ businessNumber: '783221005', hstNumber: '783221005RT0001', payrollNumber: '783221005RP0001', corporateTaxNumber: '783221005RC0002' });
  });

  it('finishes a number the old box cut short', async () => {
    render(<Harness initial={{ businessNumber: '783221005', hstNumber: '78322 1005 RT000', payrollNumber: '', corporateTaxNumber: '' }} />);
    // Cut short by the old 16-character box: the reference shows what is there and asks for the last digit.
    expect(screen.getByLabelText('GST/HST account reference')).toHaveValue('000');
    expect(screen.getByText('The reference is 4 digits, for example 0001.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('GST/HST account reference'), '1');
    expect(read().hstNumber).toBe('783221005RT0001');
  });

  it('offers to clear a number on file under the wrong program', async () => {
    render(<Harness initial={{ businessNumber: '783221005', hstNumber: '783221005RP0001', payrollNumber: '', corporateTaxNumber: '' }} />);
    expect(screen.getByText(/On file as 783221005RP0001, which is not a RT account/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'clear it' }));
    expect(read().hstNumber).toBe('');
  });

  it('is a hard rule on save: the wrong letters, a short BN or another BN are refused', () => {
    expect(companyUpdateSchema.safeParse({ businessNumber: '783221005', hstNumber: '783221005 RT 0001' }).success).toBe(true);
    expect(companyUpdateSchema.parse({ hstNumber: '783221005 rt 0001' }).hstNumber).toBe('783221005RT0001');
    const wrongLetters = companyUpdateSchema.safeParse({ businessNumber: '783221005', hstNumber: '783221005RP0001' });
    expect(wrongLetters.success).toBe(false);
    expect(companyUpdateSchema.safeParse({ businessNumber: '78322100', payrollNumber: '' }).success).toBe(false);
    expect(companyUpdateSchema.safeParse({ businessNumber: '783221005', corporateTaxNumber: '999999999RC0001' }).success).toBe(false);
    expect(companyUpdateSchema.safeParse({ businessNumber: '783221005', corporateTaxNumber: '783221005RC0001' }).success).toBe(true);
  });
});
