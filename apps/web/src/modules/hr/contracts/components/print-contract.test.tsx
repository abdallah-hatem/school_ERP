// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), redirect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({
  GET_PRINT_TEMPLATES: vi.fn(),
  GET_CONTRACT_PRINT: vi.fn(),
  CREATE_CONTRACT_COPY: vi.fn(),
}));

import { sessionWithout } from '@/test/render';
import { contract, renderContracts } from '../test/fixtures';
import { PrintContractButton } from './print-contract';

describe('Print contract — who sees it', () => {
  afterEach(() => cleanup());

  it('shows on a contract the viewer may manage', () => {
    renderContracts(<PrintContractButton contract={contract()} />);
    expect(screen.getByRole('button', { name: 'Print contract' })).toBeTruthy();
  });

  it('edge case 1: never on your own contract', () => {
    renderContracts(<PrintContractButton contract={contract({ ownContract: true })} />);
    expect(screen.queryByRole('button', { name: 'Print contract' })).toBeNull();
  });

  it('edge case 2: not with "view contracts" only', () => {
    renderContracts(<PrintContractButton contract={contract()} />, 'en', sessionWithout('hr.contracts.manage'));
    expect(screen.queryByRole('button', { name: 'Print contract' })).toBeNull();
  });

  it('edge case 13: not on a cancelled contract; an ended one still prints', () => {
    const { unmount } = renderContracts(<PrintContractButton contract={contract({ status: 'CANCELLED', phase: 'UPCOMING' })} />);
    expect(screen.queryByRole('button', { name: 'Print contract' })).toBeNull();
    unmount();
    renderContracts(<PrintContractButton contract={contract({ status: 'NOT_RENEWED', phase: 'PAST' })} />);
    expect(screen.getByRole('button', { name: 'Print contract' })).toBeTruthy();
  });
});
