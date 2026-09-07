import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { StructuredAddressFields } from './StructuredAddressFields';
import { parseStructuredAddress } from '@shared/domain/contacts/structuredAddress';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <StructuredAddressFields value={value} onChange={setValue} />
      <output data-testid="serialized">{value}</output>
    </>
  );
}

const provinceSelect = () => screen.getByLabelText('Province') as HTMLSelectElement;
const serialized = () => parseStructuredAddress(screen.getByTestId('serialized').textContent ?? '');

describe('StructuredAddressFields learns places', () => {
  beforeEach(() => localStorage.clear());

  it('fills the province from a well-known city when none is chosen', () => {
    render(<Harness />);
    const city = screen.getByLabelText('City');
    fireEvent.change(city, { target: { value: 'mississauga' } });
    fireEvent.blur(city);
    expect(provinceSelect().value).toBe('ON');
    expect((city as HTMLInputElement).value).toBe('Mississauga');
    expect(serialized().province).toBe('ON');
  });

  it('fills the province from the postal code for a town it does not know', () => {
    render(<Harness />);
    const city = screen.getByLabelText('City');
    fireEvent.change(city, { target: { value: 'Tofino' } });
    fireEvent.blur(city);
    expect(provinceSelect().value).toBe('');
    const postal = screen.getByLabelText('Postal code');
    fireEvent.change(postal, { target: { value: 'v0r2z0' } });
    fireEvent.blur(postal);
    expect(provinceSelect().value).toBe('BC');
    expect((postal as HTMLInputElement).value).toBe('V0R 2Z0');
  });

  it('never overrides a province the person chose, and learns the pair for next time', () => {
    render(<Harness />);
    fireEvent.change(provinceSelect(), { target: { value: 'NS' } });
    const city = screen.getByLabelText('City');
    fireEvent.change(city, { target: { value: 'Springfield' } });
    fireEvent.blur(city);
    expect(provinceSelect().value).toBe('NS');
    expect(JSON.parse(localStorage.getItem('nl-suggest:map:city-province') ?? '{}')).toEqual({ springfield: 'NS' });
    expect(JSON.parse(localStorage.getItem('nl-suggest:city') ?? '[]')).toEqual(['Springfield']);
  });

  it('offers learned and well-known cities as suggestions', () => {
    localStorage.setItem('nl-suggest:city', JSON.stringify(['Tofino']));
    render(<Harness />);
    const options = Array.from(document.querySelectorAll('datalist#suggest-city option')).map((option) => (option as HTMLOptionElement).value);
    expect(options[0]).toBe('Tofino');
    expect(options).toContain('Toronto');
    expect(options).toContain('Calgary');
  });
});
