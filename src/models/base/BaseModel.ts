/**
 * Base Model Abstract Class
 * فئة النموذج الأساسية المجردة
 * 
 * All database models should extend this class.
 * جميع نماذج قاعدة البيانات يجب أن ترث من هذه الفئة.
 */

import type { BaseEntity } from '../../config/types';

/**
 * Query options for find operations
 */
export interface QueryOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: 'ASC' | 'DESC';
}

/**
 * Abstract Base Model
 * Provides common CRUD operations for all models
 */
export abstract class BaseModel<T extends BaseEntity> {
    protected readonly db: D1Database;

    /** Table name in database */
    protected abstract readonly tableName: string;

    /** Primary key column (default: 'id') */
    protected readonly primaryKey: string = 'id';

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Find record by ID
     */
    async findById(id: number): Promise<T | null> {
        return await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`
        ).bind(id).first() as T | null;
    }

    /**
     * Find all records with pagination
     */
    async findAll(options: QueryOptions = {}): Promise<T[]> {
        const { limit = 20, offset = 0, orderBy = 'id', orderDir = 'DESC' } = options;

        const result = await this.db.prepare(
            `SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        return result.results as T[];
    }

    /**
     * Find one record by condition
     */
    async findOne(column: string, value: any): Promise<T | null> {
        return await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE ${column} = ?`
        ).bind(value).first() as T | null;
    }

    /**
     * Find multiple records by condition
     */
    async findBy(column: string, value: any, options: QueryOptions = {}): Promise<T[]> {
        const { limit = 20, offset = 0 } = options;

        const result = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE ${column} = ? LIMIT ? OFFSET ?`
        ).bind(value, limit, offset).all();

        return result.results as T[];
    }

    /**
     * Count all records
     */
    async count(): Promise<number> {
        const result = await this.db.prepare(
            `SELECT COUNT(*) as count FROM ${this.tableName}`
        ).first() as { count: number } | null;

        return result?.count || 0;
    }

    /**
     * Count records by condition
     */
    async countBy(column: string, value: any): Promise<number> {
        const result = await this.db.prepare(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${column} = ?`
        ).bind(value).first() as { count: number } | null;

        return result?.count || 0;
    }

    /**
     * Check if record exists
     */
    async exists(id: number): Promise<boolean> {
        const result = await this.db.prepare(
            `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = ?`
        ).bind(id).first();

        return result !== null;
    }

    /**
     * Delete record by ID
     */
    async delete(id: number): Promise<boolean> {
        const result = await this.db.prepare(
            `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`
        ).bind(id).run();

        return result.meta.changes > 0;
    }

    /**
     * Execute raw query
     */
    protected async query<R = any>(sql: string, ...params: any[]): Promise<R[]> {
        const result = await this.db.prepare(sql).bind(...params).all();
        return result.results as R[];
    }

    /**
     * Execute raw query returning single result
     */
    protected async queryOne<R = any>(sql: string, ...params: any[]): Promise<R | null> {
        return await this.db.prepare(sql).bind(...params).first() as R | null;
    }

    /**
     * Create new record - must be implemented by subclass
     */
    abstract create(data: Partial<T>): Promise<T>;

    /**
     * Update existing record - must be implemented by subclass
     */
    abstract update(id: number, data: Partial<T>): Promise<T | null>;
}

export default BaseModel;
