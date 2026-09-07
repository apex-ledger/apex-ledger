import { afterEach, describe, expect, it } from 'vitest';
import { clearAccessSession, getAccessIdentity, getAccessRole, runWithAccessSession, setAccessIdentity, setAccessRole } from './accessSession';

describe('access session identity', () => {
  afterEach(() => {
    setAccessIdentity({ key: 'local:administrator', name: 'Local Administrator', email: null });
  });

  it('normalizes and retains the signed-in person used by audit records', () => {
    expect(setAccessIdentity({ key: ' user-17 ', name: ' Asha Patel ', email: 'ASHA@EXAMPLE.CA ' })).toEqual({
      key: 'user-17',
      name: 'Asha Patel',
      email: 'asha@example.ca',
    });
    expect(getAccessIdentity()).toEqual({ key: 'user-17', name: 'Asha Patel', email: 'asha@example.ca' });
  });

  it('rejects an anonymous identity', () => {
    expect(() => setAccessIdentity({ key: '', name: '', email: null })).toThrow('identity is invalid');
  });

  it('keeps simultaneous window identities and roles isolated across awaited work', async () => {
    const [first, second] = await Promise.all([
      runWithAccessSession(101, async () => {
        setAccessIdentity({ key: 'user:alex', name: 'Alex Admin', email: 'alex@example.test' });
        setAccessRole('administrator');
        await Promise.resolve();
        return { identity: getAccessIdentity(), role: getAccessRole() };
      }),
      runWithAccessSession(202, async () => {
        setAccessIdentity({ key: 'user:jordan', name: 'Jordan Bookkeeper', email: 'jordan@example.test' });
        setAccessRole('bookkeeper');
        await Promise.resolve();
        return { identity: getAccessIdentity(), role: getAccessRole() };
      }),
    ]);
    expect(first).toMatchObject({ identity: { name: 'Alex Admin' }, role: 'administrator' });
    expect(second).toMatchObject({ identity: { name: 'Jordan Bookkeeper' }, role: 'bookkeeper' });
    clearAccessSession(101);
    clearAccessSession(202);
  });
});
