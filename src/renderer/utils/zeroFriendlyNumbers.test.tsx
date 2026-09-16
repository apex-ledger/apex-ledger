import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installZeroFriendlyNumbers, withoutLeadingZero } from './zeroFriendlyNumbers';

function Quantity() {
  const [qty, setQty] = useState(0);
  return (
    <label>
      Quantity
      <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      <output>{qty}</output>
    </label>
  );
}

let uninstall: () => void;
beforeEach(() => { uninstall = installZeroFriendlyNumbers(); });
afterEach(() => uninstall());

describe('number boxes that start at 0', () => {
  it('replace the 0 with what is typed instead of adding to it', async () => {
    render(<Quantity />);
    const box = screen.getByLabelText('Quantity') as HTMLInputElement;
    await userEvent.click(box);
    await userEvent.keyboard('5');
    expect(box.value).toBe('5');
    expect(screen.getByRole('status').textContent).toBe('5');
  });

  it('drop a zero left in front of a whole number as it is typed', () => {
    render(<Quantity />);
    const box = screen.getByLabelText('Quantity') as HTMLInputElement;
    fireEvent.input(box, { target: { value: '012' } });
    expect(box.value).toBe('12');
    expect(screen.getByRole('status').textContent).toBe('12');
  });

  it('leave decimals and a lone zero alone', () => {
    expect(withoutLeadingZero('0.5')).toBeNull();
    expect(withoutLeadingZero('0')).toBeNull();
    expect(withoutLeadingZero('05')).toBe('5');
    expect(withoutLeadingZero('0012.50')).toBe('12.50');
    expect(withoutLeadingZero('-05')).toBe('-5');
    expect(withoutLeadingZero('100')).toBeNull();
  });
});
