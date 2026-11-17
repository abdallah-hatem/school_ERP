// @vitest-environment jsdom
import { PERMISSION_KEYS } from '@school-erp/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionWithout, TEST_SESSION } from '@/test/render';
import { can, canAny } from './permissions';
import { Can, SessionProvider, useCan } from './session-context';

describe('can() (R6 — view only)', () => {
  it('the HR admin holds every key (P1): everything still shows', () => {
    for (const key of PERMISSION_KEYS) expect(can(TEST_SESSION, key)).toBe(true);
  });

  it('several keys are all required', () => {
    const recorder = sessionWithout('hr.penalties.approve');
    expect(can(recorder, ['hr.penalties.view', 'hr.penalties.record'])).toBe(true);
    // Edge case 9 — can record, can't approve: the button isn't shown.
    expect(can(recorder, 'hr.penalties.approve')).toBe(false);
    expect(can(recorder, ['hr.penalties.view', 'hr.penalties.approve'])).toBe(false);
  });

  it('signed out, or holding nothing → false', () => {
    expect(can(null, 'hr.employees.view')).toBe(false);
    expect(can(undefined, 'hr.employees.view')).toBe(false);
    expect(can({ permissions: [] }, 'hr.employees.view')).toBe(false);
  });

  it('canAny needs at least one', () => {
    const user = { permissions: ['hr.lists.view' as const] };
    expect(canAny(user, ['core.settings.view', 'hr.lists.view'])).toBe(true);
    expect(canAny(user, ['core.settings.view'])).toBe(false);
    expect(canAny(user, [])).toBe(false);
  });
});

describe('<Can> / useCan', () => {
  afterEach(cleanup);

  function Probe() {
    const allowed = useCan()('hr.payroll.approve');
    return <p>{allowed ? 'allowed' : 'refused'}</p>;
  }

  const ui = (
    <>
      <Can permission="hr.penalties.approve" fallback={<span>no approve</span>}>
        <button type="button">Approve</button>
      </Can>
      <Can permission={['hr.employees.view', 'hr.employees.edit']}>
        <button type="button">Edit</button>
      </Can>
      <Probe />
    </>
  );

  it('shows its children to a user holding the keys', () => {
    render(<SessionProvider user={TEST_SESSION}>{ui}</SessionProvider>);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByText('allowed')).toBeTruthy();
    expect(screen.queryByText('no approve')).toBeNull();
  });

  it('hides them (or shows the fallback) for a user missing one', () => {
    render(
      <SessionProvider user={sessionWithout('hr.penalties.approve', 'hr.employees.edit', 'hr.payroll.approve')}>
        {ui}
      </SessionProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('no approve')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByText('refused')).toBeTruthy();
  });

  it('outside a session (signed out) nothing gated shows', () => {
    render(ui);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('refused')).toBeTruthy();
  });
});
