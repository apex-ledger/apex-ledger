import { describe, expect, it } from 'vitest';
import {
  clientForOpenFile,
  clientsSharingAFile,
  companyFileName,
  isBookkeepingClient,
  isSameFile,
  type ClientWithFile,
} from './bookkeepingClients';

function client(overrides: Partial<ClientWithFile> = {}): ClientWithFile {
  return { id: '1', clientName: 'Akaal Software Inc.', companyFilePath: 'C:/Books/Akaal.company', ...overrides };
}

describe('who counts as a bookkeeping client', () => {
  it('is a client with books attached', () => {
    expect(isBookkeepingClient(client())).toBe(true);
  });

  it('is not a tax-only client', () => {
    // Most of a practice's list is like this: a return once a year and no ledger anywhere.
    expect(isBookkeepingClient(client({ companyFilePath: null }))).toBe(false);
  });

  it('does not count a blank path as books', () => {
    expect(isBookkeepingClient(client({ companyFilePath: '   ' }))).toBe(false);
  });
});

describe('matching the open file to a client', () => {
  it('names the client whose books are open', () => {
    const found = clientForOpenFile([client({ id: '1' })], 'C:/Books/Akaal.company');
    expect(found?.id).toBe('1');
  });

  it('matches regardless of slash direction', () => {
    // The same file reached two ways must not look like two files, or the header silently stops
    // naming the client.
    expect(isSameFile('C:\\Books\\Akaal.company', 'C:/Books/Akaal.company')).toBe(true);
  });

  it('matches regardless of case, as Windows does', () => {
    expect(isSameFile('C:/Books/AKAAL.company', 'c:/books/akaal.company')).toBe(true);
  });

  it('does not match two genuinely different files', () => {
    expect(isSameFile('C:/Books/Akaal.company', 'C:/Books/Other.company')).toBe(false);
  });

  it('treats a missing path as no match rather than a match on nothing', () => {
    expect(isSameFile(null, null)).toBe(false);
    expect(isSameFile('C:/Books/Akaal.company', null)).toBe(false);
  });

  it('names nobody when no file is open', () => {
    expect(clientForOpenFile([client()], null)).toBeNull();
  });

  it('names nobody when the open file belongs to no client', () => {
    expect(clientForOpenFile([client()], 'C:/Books/Someone else.company')).toBeNull();
  });
});

describe('two clients pointing at one file', () => {
  it('is reported rather than resolved by guessing', () => {
    // One of them is looking at somebody else's books. Naming an arbitrary one would hide that.
    const clients = [client({ id: '1' }), client({ id: '2', clientName: 'Different Co' })];
    expect(clientForOpenFile(clients, 'C:/Books/Akaal.company')).toBeNull();
  });

  it('lists the clients that clash', () => {
    const clients = [client({ id: '1' }), client({ id: '2', clientName: 'Different Co' }), client({ id: '3', companyFilePath: 'C:/Books/Other.company' })];
    const groups = clientsSharingAFile(clients);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('spots a clash written with different slashes', () => {
    const clients = [client({ id: '1', companyFilePath: 'C:\\Books\\Akaal.company' }), client({ id: '2' })];
    expect(clientsSharingAFile(clients)).toHaveLength(1);
  });

  it('reports nothing when every client has their own file', () => {
    const clients = [client({ id: '1' }), client({ id: '2', companyFilePath: 'C:/Books/Other.company' })];
    expect(clientsSharingAFile(clients)).toEqual([]);
  });

  it('does not treat two tax-only clients as sharing a file', () => {
    const clients = [client({ id: '1', companyFilePath: null }), client({ id: '2', companyFilePath: null })];
    expect(clientsSharingAFile(clients)).toEqual([]);
  });
});

describe('showing the path', () => {
  it('shows the file name rather than the whole path', () => {
    expect(companyFileName('C:/Books/Clients/2026/Akaal.company')).toBe('Akaal.company');
  });

  it('handles a Windows path', () => {
    expect(companyFileName('C:\\Books\\Akaal.company')).toBe('Akaal.company');
  });

  it('shows nothing for a client with no books', () => {
    expect(companyFileName(null)).toBeNull();
  });
});
