import { SessionRevocation } from './session-revocation';

describe('SessionRevocation', () => {
  it('passes the call to the one registered revoker', async () => {
    const revocation = new SessionRevocation();
    const revoker = jest.fn().mockResolvedValue(2);
    revocation.register(revoker);
    const at = new Date();
    await revocation.endOtherSessions('u-1', at, 'fam-1');
    expect(revoker).toHaveBeenCalledWith('u-1', at, 'fam-1');
  });

  it('a second registration is refused (it would silently replace how sessions end)', () => {
    const revocation = new SessionRevocation();
    revocation.register(jest.fn());
    expect(() => revocation.register(jest.fn())).toThrow('already registered');
  });

  it('nothing registered: ending sessions fails rather than skipping (the change rolls back)', async () => {
    await expect(new SessionRevocation().endOtherSessions('u-1', new Date())).rejects.toThrow('no revoker');
  });
});
