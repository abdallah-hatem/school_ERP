import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsEvent, ErrorCode, LOGO_UPLOAD } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import type { FileStorageService } from './files/file-storage.service';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AfterCommit, DbAdapter } from '../../database/transactions';
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
  const events = {
    emitAsync: jest.fn(() => {
      calls.push('emit');
      return Promise.resolve([]);
    }),
  };
  const files = {
    save: jest.fn((folder: string, name: string) => Promise.resolve(`/files/${folder}/${name}`)),
  };
  const audit = {
    record: jest.fn(() => {
      calls.push('audit');
      return Promise.resolve();
    }),
    listChanges: jest.fn(),
  };
  // The transaction just runs its callback; a thrown error is what rolls it back.
  const txHost = {
    withTransaction: jest.fn((fn: () => Promise<unknown>) => {
      calls.push('tx');
      return fn().then((r) => {
        calls.push('commit');
        return r;
      });
    }),
  };
  const afterCommit = { run: jest.fn((fn: () => unknown) => Promise.resolve(fn())) };
  const service = new SettingsService(
    settings as unknown as SchoolSettingRepository,
    files as unknown as FileStorageService,
    events as unknown as EventEmitter2,
    audit as unknown as AuditService,
    txHost as unknown as TransactionHost<DbAdapter>,
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
  it('writes only changed keys and records them in the same transaction, then emits one settings.changed per key after the commit', async () => {
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
    expect(events.emitAsync).toHaveBeenCalledTimes(1);
    expect(events.emitAsync).toHaveBeenCalledWith(
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
    expect(calls).toEqual(['tx', 'write', 'audit', 'commit', 'emit']);
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
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('does not emit when the write fails', async () => {
    const { service, settings, events } = makeService();
    settings.upsertMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.setValues('hr', { 'hr.payroll.dayDivisor': 26 }, 'u')).rejects.toThrow(
      'db down',
    );
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('edge case 3 — no change → no write and no event; record() is still called with no changes', async () => {
    const { service, settings, events, audit } = makeService();
    expect(await service.setValues('school', { 'school.workStart': '07:30' }, 'u')).toEqual([]);
    expect(settings.upsertMany).not.toHaveBeenCalled();
    expect(events.emitAsync).not.toHaveBeenCalled();
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

  it('history: one item per changed key, the scope from the action, the first key keeps the entry id', async () => {
    const { service, audit } = makeService();
    const at = new Date('2026-11-17T10:00:00.000Z');
    const row = (ord: number, field: string, action = 'core.settings.update') => ({
      id: 'e1',
      action,
      actorId: 'u1',
      actorName: 'Mona',
      at,
      ord,
      change: { field, before: 'a', after: 'b' },
    });
    audit.listChanges.mockResolvedValueOnce({
      data: [
        row(1, 'school.workStart'),
        row(2, 'school.workEnd'),
        {
          ...row(1, 'hr.departments', 'hr.department.update'),
          id: 'e2',
          actorId: null,
          actorName: null,
        },
      ],
      total: 3,
      page: 1,
      limit: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    const page = await service.listHistory(1, 20);
    expect(page.data).toEqual([
      {
        id: 'e1',
        scope: 'school',
        key: 'school.workStart',
        oldValue: 'a',
        newValue: 'b',
        changedBy: { id: 'u1', name: 'Mona' },
        changedAt: at.toISOString(),
      },
      {
        id: 'e1:2',
        scope: 'school',
        key: 'school.workEnd',
        oldValue: 'a',
        newValue: 'b',
        changedBy: { id: 'u1', name: 'Mona' },
        changedAt: at.toISOString(),
      },
      {
        id: 'e2',
        scope: 'lists',
        key: 'hr.departments',
        oldValue: 'a',
        newValue: 'b',
        changedBy: null,
        changedAt: at.toISOString(),
      },
    ]);
    expect(page.total).toBe(3);
  });
});
