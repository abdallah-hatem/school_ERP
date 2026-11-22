import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { APP_ICON_FOLDER, type AuthUser, type PermissionKey } from '@school-erp/shared';
import { PermissionsService } from '../../permissions';
import { LOGO_FOLDER } from '../settings.pure';

/*
 * Every folder of stored files says whose files they are and who may open one (docs/ARCHITECTURE.md
 * → Security → Files follow their record). The rule is the owning record's: a file opens for the
 * people who may see that record, and for nobody else — 404, the answer the record itself gives, so
 * the file's existence isn't confirmed.
 *
 * Core can't know HR's (or a later module's) records, so the owning module registers its folder on
 * start (`onModuleInit`), as HR does for `employee-photos` (`HrFileAccess`). A folder nobody
 * registered can't be written to (`FileStorageService.save`) or read: storage refuses it, and the
 * unit guard `file-folders.guard.spec.ts` fails on a save into a folder that isn't registered
 * anywhere.
 */

/** Folders anyone may open (the sign-in page and the installed app show them): own public routes. */
export const PUBLIC_FILE_FOLDERS: readonly string[] = [LOGO_FOLDER, APP_ICON_FOLDER];

/** Who may open the files of one folder. */
export interface FileFolderAccess {
  /** The record a file belongs to, for the docs and the error messages (e.g. `hr.employee`). */
  owner: string;
  /**
   * An extra permission to open any file here, on top of seeing its record — for sensitive
   * documents (contracts, medical, legal, investigations). Not held → 404.
   */
  permission?: PermissionKey;
  /**
   * Whether `user` may open the file at `url` (`/files/<folder>/<name>`): find the record that
   * points at it — the stored link, never a name taken apart — and apply that record's view
   * permission and scope. Unknown file or record → false.
   */
  canOpen(user: AuthUser, url: string): Promise<boolean>;
  /**
   * Runs once a file is opened (after `canOpen` agreed). A sensitive folder records the opening
   * here — `audit.record({ action: '<module>.<record>.document_view', … })` in a transaction of its
   * own, since the GET has none (list that file in docs/EVENTS.md then). No folder does this yet.
   */
  onOpen?(user: AuthUser, url: string): Promise<void>;
}

@Injectable()
export class FileFolders {
  private readonly logger = new Logger(FileFolders.name);
  private readonly folders = new Map<string, FileFolderAccess>();

  constructor(private readonly permissions: PermissionsService) {}

  /** Called by the owning module on start. A folder has one owner: a second registration throws. */
  register(folder: string, access: FileFolderAccess): void {
    if (PUBLIC_FILE_FOLDERS.includes(folder) || this.folders.has(folder)) {
      throw new Error(`files: the folder "${folder}" is already registered`);
    }
    this.folders.set(folder, access);
  }

  /** Whether files may be stored in `folder`: a public folder or a registered one. */
  isKnown(folder: string): boolean {
    return PUBLIC_FILE_FOLDERS.includes(folder) || this.folders.has(folder);
  }

  /** The registered (non-public) folders. */
  registered(): string[] {
    return [...this.folders.keys()];
  }

  /**
   * Throws 404 unless `user` may open `/files/<folder>/<name>`: a registered folder, its extra
   * permission held (if any), and its owner check agreeing. Then runs the folder's `onOpen`.
   * Public folders have their own routes and are refused here like any unknown folder.
   */
  async assertCanOpen(user: AuthUser, folder: string, name: string): Promise<void> {
    const access = this.folders.get(folder);
    if (!access) throw new NotFoundException();
    if (access.permission && (await this.permissions.scopeFor(user, access.permission)) === null) {
      throw new NotFoundException();
    }
    const url = `/files/${folder}/${name}`;
    if (!(await access.canOpen(user, url))) throw new NotFoundException();
    if (access.onOpen) {
      await access.onOpen(user, url).catch((e: unknown) => {
        // Opening must be recorded, or not happen: a failed record is a refusal.
        this.logger.error(`files: recording the opening of ${url} failed`, e instanceof Error ? e.stack : String(e));
        throw e;
      });
    }
  }
}
