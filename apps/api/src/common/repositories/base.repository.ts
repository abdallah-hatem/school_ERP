import { Injectable } from '@nestjs/common';
import { PAGINATION } from '@school-erp/shared';
import { DatabaseService } from '../../database/database.service';
import type { Paginated } from '../interfaces/api-response.interface';
import type { IRepository } from '../interfaces/repository.interface';

/** The subset of a Prisma model delegate the base class uses. */
interface ModelDelegate<T> {
  create(args: { data: unknown }): Promise<T>;
  findMany(args?: {
    where?: Record<string, unknown>;
    skip?: number;
    take?: number;
    orderBy?: unknown;
    select?: unknown;
  }): Promise<T[]>;
  findUnique(args: { where: { id: string } }): Promise<T | null>;
  update(args: { where: { id: string }; data: unknown }): Promise<T>;
  delete(args: { where: { id: string } }): Promise<T>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
}

/** Optional `select` (explicit columns for anything reaching a response) and `orderBy`. */
export interface PaginationShape {
  select?: unknown;
  orderBy?: unknown;
}

/** A Prisma model delegate name on DatabaseService (e.g. 'employee', 'payrollRun'). */
export type ModelName = {
  [K in keyof DatabaseService]: DatabaseService[K] extends { findMany: unknown } ? K : never;
}[keyof DatabaseService];

/**
 * Every Prisma call lives in a repository extending this class. `limit` is capped here (the
 * contract's max, 100), so no caller can ask for more by editing a query string.
 */
@Injectable()
export abstract class BaseRepository<T, CreateDto, UpdateDto> implements IRepository<
  T,
  CreateDto,
  UpdateDto
> {
  protected constructor(
    protected readonly databaseService: DatabaseService,
    protected readonly modelName: ModelName,
  ) {}

  protected get model(): ModelDelegate<T> {
    return this.databaseService[this.modelName] as unknown as ModelDelegate<T>;
  }

  async create(data: CreateDto): Promise<T> {
    return this.model.create({ data });
  }

  async findAll(): Promise<T[]> {
    return this.model.findMany();
  }

  /**
   * Generic pagination with search. Override in a repository to fix its searchable fields.
   *
   * @example
   * async findAllWithPagination(page = 1, limit = 20, search?: string) {
   *   return super.findAllWithPagination(page, limit, search, ['nameEn', 'nameAr', 'code']);
   * }
   */
  async findAllWithPagination(
    page: number = PAGINATION.defaultPage,
    limit: number = PAGINATION.defaultLimit,
    search?: string,
    searchFields?: string[],
    where?: Record<string, unknown>,
    query?: PaginationShape,
  ): Promise<Paginated<T>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const current = Math.max(1, page);

    const whereCondition: Record<string, unknown> = { ...where };
    if (search && searchFields?.length) {
      whereCondition.OR = searchFields.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      }));
    }

    const [data, total] = await Promise.all([
      this.model.findMany({
        skip: (current - 1) * take,
        take,
        where: whereCondition,
        ...(query?.select ? { select: query.select } : {}),
        ...(query?.orderBy ? { orderBy: query.orderBy } : {}),
      }),
      this.model.count({ where: whereCondition }),
    ]);

    return {
      data,
      total,
      page: current,
      limit: take,
      hasNextPage: current * take < total,
      hasPreviousPage: current > 1,
    };
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateDto): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.model.delete({ where: { id } });
  }
}
