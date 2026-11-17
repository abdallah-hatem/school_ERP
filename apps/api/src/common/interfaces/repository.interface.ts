import type { Paginated } from './api-response.interface';

export interface IRepository<T, CreateDto, UpdateDto> {
  create(data: CreateDto): Promise<T>;
  findAll(): Promise<T[]>;
  findAllWithPagination(
    page?: number,
    limit?: number,
    search?: string,
    searchFields?: string[],
    where?: Record<string, unknown>,
    query?: { select?: unknown; orderBy?: unknown },
  ): Promise<Paginated<T>>;
  findById(id: string): Promise<T | null>;
  update(id: string, data: UpdateDto): Promise<T>;
  delete(id: string): Promise<void>;
}
