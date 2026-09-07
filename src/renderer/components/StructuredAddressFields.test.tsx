import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StructuredAddressFields } from './StructuredAddressFields';

function Harness() {
  const [value, setValue] = useState('');
  return <><StructuredAddressFields value={value} onChange={setValue} /><output>{value}</output></>;
}

describe('StructuredAddressFields', () => {
  it('allows typing and backspacing without repeatedly inserting Canada', async () => {
    render(<Harness />);
    const street = screen.getByLabelText('Street number and street address');

    await userEvent.type(street, '2');
    await userEvent.keyboard('{Backspace}');
    await userEvent.type(street, '123 Main Street');

    expect((street as HTMLInputElement).value).toBe('123 Main Street');
    expect((street as HTMLInputElement).value).not.toContain('Canada');
    expect(screen.getByRole('status').textContent).toContain('123 Main Street');
  });
});
