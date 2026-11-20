import { SettingsEvent, ErrorCode, LOGO_UPLOAD } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import type { FileStorageService } from './files/file-storage.service';
import type { AfterCommit } from '../../database/transactions';
import type { DomainEvents } from '../events';
import type { AuditService } from '../audit';
import type { SchoolSettingRepository } from './repositories/school-setting.repository';
import { SettingsService } from './settings.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function makeService(stored: Array<{ key: string; value: unknown }> = []) {
  const calls: string[] = [];
  const settings = {
    findByKeys: jest.fn((keys: string[]) =>
      Promise.resolve(stored.filter((s) => keys.includes(s.key))),
    ),
    upsertMany: jest.fn(() => {
      calls.push('write');
      return Promise.resolve();
    }),
  };
  // DomainEvents queues the event until the commit itself (its own spec); here: was it published
  // inside the transaction?
  const events = {
    publish: jest.fn(() => {
      calls.push('publish');
      return Promise.resolve();
    }),
  };
  const files = {
    save: jest.fn((folder: string, name: string) => Promise.resolve(`/files/${folder}/${name}`)),
    remove: jest.fn(() => Promise.resolve()),
  };
  const audit = {
    record: jest.fn(() => {
      calls.push('audit');
      return Promise.resolve();
    }),
  };
  // The transaction just runs its callback; a thrown error is what rolls it back (and runs the
  // rollback work).
  const rollback: (() => unknown)[] = [];
  const afterCommit = {
    inTransaction: jest.fn(async (fn: () => Promise<unknown>) => {
      calls.push('tx');
      try {
        const r = await fn();
        calls.push('commit');
        return r;
      } catch (e) {
        for (const f of rollback.splice(0)) await f();
        throw e;
      }
    }),
    onRollback: jest.fn((fn: () => unknown) => void rollback.push(fn)),
  };
  const service = new SettingsService(
    settings as unknown as SchoolSettingRepository,
    files as unknown as FileStorageService,
    events as unknown as DomainEvents,
    audit as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
  );
  return { service, settings, events, files, audit, calls };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  return e instanceof CodedException ? { status: e.getStatus(), code: e.code } : e;
};

describe('SettingsService', () => {
  it('writes only changed keys and records them in the same transaction, and publishes one core.settings.changed per key in it (sent after the commit)', async () => {
    const { service, settings, events, audit, calls } = makeService([
      { key: 'school.workStart', value: '07:30' },
    ]);

    const changed = await service.setValues(
      'school',
      { 'school.workStart': '08:00', 'school.defaultLanguage': 'en' },
      'user-1',
    );

    expect(changed).toEqual(['school.workStart']);
    expect(settings.upsertMany).toHaveBeenCalledWith(
      [{ key: 'school.workStart', value: '08:00' }],
      'user-1',
    );
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({
        scope: 'school',
        key: 'school.workStart',
        oldValue: '07:30',
        newValue: '08:00',
        changedById: 'user-1',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.settings.update',
      entity: { type: 'school_settings', id: 'school', label: '' },
      changes: [{ field: 'school.workStart', before: '07:30', after: '08:00' }],
    });
    expect(calls).toEqual(['tx', 'write', 'audit', 'publish', 'commit']);
  });

  it('HR keys are recorded as hr.settings.update on the HR rules record', async () => {
    const { service, audit } = makeService();
    await service.setValues('hr', { 'hr.payroll.dayDivisor': 26 }, 'u');
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.settings.update',
      entity: { type: 'hr_settings', id: 'hr', label: '' },
      changes: [{ field: 'hr.payroll.dayDivisor', before: 30, after: 26 }],
    });
  });

  it('edge case 2 — the audit write fails: the error reaches the caller and nothing is emitted', async () => {
    const { service, events, audit } = makeService();
    audit.record.mockRejectedValueOnce(new Error('audit down'));
    await expect(service.setValues('school', { 'school.workStart': '08:00' }, 'u')).rejects.toThrow(
      'audit down',
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('does not emit when the write fails', async () => {
    const { service, settings, events } = makeService();
    settings.upsertMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.setValues('hr', { 'hr.payroll.dayDivisor': 26 }, 'u')).rejects.toThrow(
      'db down',
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('edge case 3 — no change → no write and no event; record() is still called with no changes', async () => {
    const { service, settings, events, audit } = makeService();
    expect(await service.setValues('school', { 'school.workStart': '07:30' }, 'u')).toEqual([]);
    expect(settings.upsertMany).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
    // Writes no entry (AuditService drops empty changes) but answers `@Audited` (D6b).
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ changes: [] }));
  });

  it('refuses work hours out of order against the stored start, writing nothing', async () => {
    const { service, settings } = makeService([{ key: 'school.workStart', value: '09:00' }]);
    expect(await codeOf(service.updateSchoolSettings({ workEnd: '08:30' }, 'u'))).toEqual({
      status: 400,
      code: ErrorCode.INVALID_WORK_HOURS,
    });
    expect(settings.upsertMany).not.toHaveBeenCalled();
  });

  it('rejects a logo whose bytes are not the declared image type', async () => {
    const { service, files } = makeService();
    const file = { mimetype: 'image/jpeg', size: PNG.length, buffer: PNG };
    expect(await codeOf(service.setLogo(file, 'u'))).toEqual({
      status: 400,
      code: ErrorCode.INVALID_FILE_TYPE,
    });
    expect(files.save).not.toHaveBeenCalled();
  });

  it('rejects a logo over 2 MB with 413', async () => {
    const { service } = makeService();
    const file = { mimetype: 'image/png', size: LOGO_UPLOAD.maxBytes + 1, buffer: PNG };
    expect(await codeOf(service.setLogo(file, 'u'))).toEqual({
      status: 413,
      code: ErrorCode.FILE_TOO_LARGE,
    });
  });

  it('stores a valid logo under a fresh name and records the new logoUrl', async () => {
    const { service, settings, audit } = makeService();
    const { logoUrl } = await service.setLogo(
      { mimetype: 'image/png', size: PNG.length, buffer: PNG },
      'u',
    );
    expect(logoUrl).toMatch(/^\/files\/logo\/logo-[0-9a-f-]{36}\.png$/);
    expect(settings.upsertMany).toHaveBeenCalledWith(
      [{ key: 'school.logoUrl', value: logoUrl }],
      'u',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'core.settings.logo_change',
        changes: [{ field: 'school.logoUrl', before: null, after: logoUrl }],
      }),
    );
  });

  it('gap 8 — the logo change rolls back: the new file is deleted again', async () => {
    const { service, files, audit } = makeService();
    audit.record.mockRejectedValueOnce(new Error('audit down'));
    await expect(
      service.setLogo({ mimetype: 'image/png', size: PNG.length, buffer: PNG }, 'u'),
    ).rejects.toThrow('audit down');
    const saved = await (files.save.mock.results[0]?.value as Promise<string>);
    expect(files.remove).toHaveBeenCalledWith(saved);
  });

  it('gap 8 — a logo change that commits keeps its file', async () => {
    const { service, files } = makeService();
    await service.setLogo({ mimetype: 'image/png', size: PNG.length, buffer: PNG }, 'u');
    expect(files.remove).not.toHaveBeenCalled();
  });
});
