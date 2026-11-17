import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsEvent, ErrorCode, LOGO_UPLOAD } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import type { FileStorageService } from './files/file-storage.service';
import type { SchoolSettingRepository } from './repositories/school-setting.repository';
import type { SettingChangeRepository } from './repositories/setting-change.repository';
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
  const service = new SettingsService(
    settings as unknown as SchoolSettingRepository,
    {} as SettingChangeRepository,
    files as unknown as FileStorageService,
    events as unknown as EventEmitter2,
  );
  return { service, settings, events, files, calls };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  return e instanceof CodedException ? { status: e.getStatus(), code: e.code } : e;
};

describe('SettingsService', () => {
  it('writes only changed keys, then emits one settings.changed per key after the write', async () => {
    const { service, settings, events, calls } = makeService([
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
    expect(calls).toEqual(['write', 'emit']);
  });

  it('does not emit when the write fails', async () => {
    const { service, settings, events } = makeService();
    settings.upsertMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.setValues('hr', { 'hr.payroll.dayDivisor': 26 }, 'u')).rejects.toThrow(
      'db down',
    );
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('no change → no write and no event', async () => {
    const { service, settings, events } = makeService();
    expect(await service.setValues('school', { 'school.workStart': '07:30' }, 'u')).toEqual([]);
    expect(settings.upsertMany).not.toHaveBeenCalled();
    expect(events.emitAsync).not.toHaveBeenCalled();
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
    const { service, settings } = makeService();
    const { logoUrl } = await service.setLogo(
      { mimetype: 'image/png', size: PNG.length, buffer: PNG },
      'u',
    );
    expect(logoUrl).toMatch(/^\/files\/logo\/logo-[0-9a-f-]{36}\.png$/);
    expect(settings.upsertMany).toHaveBeenCalledWith(
      [{ key: 'school.logoUrl', value: logoUrl }],
      'u',
    );
  });
});
