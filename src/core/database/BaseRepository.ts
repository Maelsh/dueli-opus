/**
 * @file core/database/BaseRepository.ts
 * @description المستودع الأساسي للتعامل مع قاعدة البيانات D1
 * @description_en Base Repository for D1 Database operations
 * @module core/database
 * @version 1.0.0
 * @author Dueli Team
 */

import type { PaginationOptions, PaginatedResult } from '../http/types';

/**
 * خيارات البحث
 * Query options
 */
export interface QueryOptions {
  where?: Record<string, any>;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

/**
 * نتيجة الإدراج
 * Insert result
 */
export interface InsertResult {
  id: number;
  success: boolean;
}

/**
 * نتيجة التحديث
 * Update result
 */
export interface UpdateResult {
  success: boolean;
  changes: number;
}

/**
 * نتيجة الحذف
 * Delete result
 */
export interface DeleteResult {
  success: boolean;
  changes: number;
}

/**
 * المستودع الأساسي المجرد
 * Abstract Base Repository
 * 
 * يوفر عمليات CRUD الأساسية للتعامل مع قاعدة البيانات D1
 * Provides basic CRUD operations for D1 Database
 * 
 * @example
 * ```typescript
 * class UserRepository extends BaseRepository<User> {
 *   constructor(db: D1Database) {
 *     super(db, 'users');
 *   }
 *   
 *   async findByEmail(email: string): Promise<User | null> {
 *     return this.findOneBy({ email });
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<T extends { id?: number }> {
  protected db: D1Database;
  protected tableName: string;

  constructor(db: D1Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  // ============================================
  // Query Methods - دوال الاستعلام
  // ============================================

  /**
   * البحث عن سجل بالمعرف
   * Find record by ID
   * 
   * @param id - معرف السجل
   * @returns السجل أو null
   */
  async findById(id: number): Promise<T | null> {
    try {
      const result = await this.db
        .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
        .bind(id)
        .first<T>();
      return result || null;
    } catch (error) {
      this.logError('findById', error);
      return null;
    }
  }

  /**
   * البحث عن سجل واحد بشروط
   * Find one record by conditions
   * 
   * @param conditions - شروط البحث
   * @returns السجل أو null
   */
  async findOneBy(conditions: Partial<T>): Promise<T | null> {
    try {
      const { whereClause, values } = this.buildWhereClause(conditions);
      const query = `SELECT * FROM ${this.tableName} ${whereClause} LIMIT 1`;
      const result = await this.db
        .prepare(query)
        .bind(...values)
        .first<T>();
      return result || null;
    } catch (error) {
      this.logError('findOneBy', error);
      return null;
    }
  }

  /**
   * البحث عن سجلات متعددة بشروط
   * Find multiple records by conditions
   * 
   * @param conditions - شروط البحث
   * @param options - خيارات الاستعلام
   * @returns مصفوفة السجلات
   */
  async findBy(conditions: Partial<T>, options?: QueryOptions): Promise<T[]> {
    try {
      const { whereClause, values } = this.buildWhereClause(conditions);
      let query = `SELECT * FROM ${this.tableName} ${whereClause}`;
      
      if (options?.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.order || 'ASC'}`;
      }
      
      if (options?.limit) {
        query += ` LIMIT ${options.limit}`;
        if (options.offset) {
          query += ` OFFSET ${options.offset}`;
        }
      }
      
      const result = await this.db
        .prepare(query)
        .bind(...values)
        .all<T>();
      return result.results || [];
    } catch (error) {
      this.logError('findBy', error);
      return [];
    }
  }

  /**
   * الحصول على جميع السجلات
   * Get all records
   * 
   * @param options - خيارات الاستعلام
   * @returns مصفوفة السجلات
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      
      if (options?.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.order || 'ASC'}`;
      }
      
      if (options?.limit) {
        query += ` LIMIT ${options.limit}`;
        if (options.offset) {
          query += ` OFFSET ${options.offset}`;
        }
      }
      
      const result = await this.db.prepare(query).all<T>();
      return result.results || [];
    } catch (error) {
      this.logError('findAll', error);
      return [];
    }
  }

  /**
   * الحصول على سجلات مع صفحات
   * Get paginated records
   * 
   * @param pagination - خيارات الصفحات
   * @param conditions - شروط البحث (اختياري)
   * @returns نتيجة مع صفحات
   */
  async findPaginated(
    pagination: PaginationOptions,
    conditions?: Partial<T>,
    orderBy?: string,
    order?: 'ASC' | 'DESC'
  ): Promise<PaginatedResult<T>> {
    try {
      const { whereClause, values } = conditions 
        ? this.buildWhereClause(conditions)
        : { whereClause: '', values: [] };
      
      // عد إجمالي السجلات
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const countResult = await this.db
        .prepare(countQuery)
        .bind(...values)
        .first<{ total: number }>();
      const total = countResult?.total || 0;
      
      // جلب السجلات
      let query = `SELECT * FROM ${this.tableName} ${whereClause}`;
      if (orderBy) {
        query += ` ORDER BY ${orderBy} ${order || 'ASC'}`;
      }
      query += ` LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;
      
      const result = await this.db
        .prepare(query)
        .bind(...values)
        .all<T>();
      
      return {
        data: result.results || [],
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + pagination.limit < total
      };
    } catch (error) {
      this.logError('findPaginated', error);
      return {
        data: [],
        total: 0,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: false
      };
    }
  }

  /**
   * عد السجلات
   * Count records
   * 
   * @param conditions - شروط البحث (اختياري)
   * @returns عدد السجلات
   */
  async count(conditions?: Partial<T>): Promise<number> {
    try {
      const { whereClause, values } = conditions 
        ? this.buildWhereClause(conditions)
        : { whereClause: '', values: [] };
      
      const query = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
      const result = await this.db
        .prepare(query)
        .bind(...values)
        .first<{ count: number }>();
      return result?.count || 0;
    } catch (error) {
      this.logError('count', error);
      return 0;
    }
  }

  /**
   * التحقق من وجود سجل
   * Check if record exists
   * 
   * @param conditions - شروط البحث
   * @returns true إذا وجد
   */
  async exists(conditions: Partial<T>): Promise<boolean> {
    const result = await this.findOneBy(conditions);
    return result !== null;
  }

  // ============================================
  // Mutation Methods - دوال التعديل
  // ============================================

  /**
   * إدراج سجل جديد
   * Insert new record
   * 
   * @param data - بيانات السجل
   * @returns نتيجة الإدراج
   */
  async create(data: Omit<T, 'id'>): Promise<InsertResult> {
    try {
      const { columns, placeholders, values } = this.buildInsertClause(data as Partial<T>);
      const query = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
      
      const result = await this.db
        .prepare(query)
        .bind(...values)
        .run();
      
      return {
        id: result.meta.last_row_id as number,
        success: result.success
      };
    } catch (error) {
      this.logError('create', error);
      return { id: 0, success: false };
    }
  }

  /**
   * تحديث سجل بالمعرف
   * Update record by ID
   * 
   * @param id - معرف السجل
   * @param data - البيانات المحدثة
   * @returns نتيجة التحديث
   */
  async update(id: number, data: Partial<T>): Promise<UpdateResult> {
    try {
      const { setClause, values } = this.buildUpdateClause(data);
      const query = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
      
      const result = await this.db
        .prepare(query)
        .bind(...values, id)
        .run();
      
      return {
        success: result.success,
        changes: result.meta.changes as number
      };
    } catch (error) {
      this.logError('update', error);
      return { success: false, changes: 0 };
    }
  }

  /**
   * تحديث سجلات بشروط
   * Update records by conditions
   * 
   * @param conditions - شروط التحديث
   * @param data - البيانات المحدثة
   * @returns نتيجة التحديث
   */
  async updateBy(conditions: Partial<T>, data: Partial<T>): Promise<UpdateResult> {
    try {
      const { setClause, values: updateValues } = this.buildUpdateClause(data);
      const { whereClause, values: whereValues } = this.buildWhereClause(conditions);
      const query = `UPDATE ${this.tableName} SET ${setClause} ${whereClause}`;
      
      const result = await this.db
        .prepare(query)
        .bind(...updateValues, ...whereValues)
        .run();
      
      return {
        success: result.success,
        changes: result.meta.changes as number
      };
    } catch (error) {
      this.logError('updateBy', error);
      return { success: false, changes: 0 };
    }
  }

  /**
   * حذف سجل بالمعرف
   * Delete record by ID
   * 
   * @param id - معرف السجل
   * @returns نتيجة الحذف
   */
  async delete(id: number): Promise<DeleteResult> {
    try {
      const result = await this.db
        .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
        .bind(id)
        .run();
      
      return {
        success: result.success,
        changes: result.meta.changes as number
      };
    } catch (error) {
      this.logError('delete', error);
      return { success: false, changes: 0 };
    }
  }

  /**
   * حذف سجلات بشروط
   * Delete records by conditions
   * 
   * @param conditions - شروط الحذف
   * @returns نتيجة الحذف
   */
  async deleteBy(conditions: Partial<T>): Promise<DeleteResult> {
    try {
      const { whereClause, values } = this.buildWhereClause(conditions);
      const query = `DELETE FROM ${this.tableName} ${whereClause}`;
      
      const result = await this.db
        .prepare(query)
        .bind(...values)
        .run();
      
      return {
        success: result.success,
        changes: result.meta.changes as number
      };
    } catch (error) {
      this.logError('deleteBy', error);
      return { success: false, changes: 0 };
    }
  }

  // ============================================
  // Raw Query Methods - استعلامات مباشرة
  // ============================================

  /**
   * تنفيذ استعلام SQL مخصص (SELECT)
   * Execute custom SQL query (SELECT)
   * 
   * @param query - استعلام SQL
   * @param params - المعاملات
   * @returns النتائج
   */
  async rawQuery<R = T>(query: string, params: any[] = []): Promise<R[]> {
    try {
      const result = await this.db
        .prepare(query)
        .bind(...params)
        .all<R>();
      return result.results || [];
    } catch (error) {
      this.logError('rawQuery', error);
      return [];
    }
  }

  /**
   * تنفيذ استعلام SQL مخصص (واحد)
   * Execute custom SQL query (single)
   */
  async rawQueryFirst<R = T>(query: string, params: any[] = []): Promise<R | null> {
    try {
      const result = await this.db
        .prepare(query)
        .bind(...params)
        .first<R>();
      return result || null;
    } catch (error) {
      this.logError('rawQueryFirst', error);
      return null;
    }
  }

  /**
   * تنفيذ أمر SQL مخصص (INSERT, UPDATE, DELETE)
   * Execute custom SQL command
   */
  async rawExecute(query: string, params: any[] = []): Promise<D1Result> {
    try {
      return await this.db
        .prepare(query)
        .bind(...params)
        .run();
    } catch (error) {
      this.logError('rawExecute', error);
      throw error;
    }
  }

  // ============================================
  // Helper Methods - دوال مساعدة
  // ============================================

  /**
   * بناء جملة WHERE
   * Build WHERE clause
   */
  protected buildWhereClause(conditions: Partial<T>): {
    whereClause: string;
    values: any[];
  } {
    const entries = Object.entries(conditions).filter(([_, v]) => v !== undefined);
    
    if (entries.length === 0) {
      return { whereClause: '', values: [] };
    }
    
    const clauses = entries.map(([key, value]) => {
      if (value === null) {
        return `${key} IS NULL`;
      }
      return `${key} = ?`;
    });
    
    const values = entries
      .filter(([_, v]) => v !== null)
      .map(([_, v]) => v);
    
    return {
      whereClause: `WHERE ${clauses.join(' AND ')}`,
      values
    };
  }

  /**
   * بناء جملة INSERT
   * Build INSERT clause
   */
  protected buildInsertClause(data: Partial<T>): {
    columns: string;
    placeholders: string;
    values: any[];
  } {
    const entries = Object.entries(data).filter(([_, v]) => v !== undefined);
    
    return {
      columns: entries.map(([k]) => k).join(', '),
      placeholders: entries.map(() => '?').join(', '),
      values: entries.map(([_, v]) => v)
    };
  }

  /**
   * بناء جملة UPDATE SET
   * Build UPDATE SET clause
   */
  protected buildUpdateClause(data: Partial<T>): {
    setClause: string;
    values: any[];
  } {
    const entries = Object.entries(data).filter(([_, v]) => v !== undefined);
    
    return {
      setClause: entries.map(([k]) => `${k} = ?`).join(', '),
      values: entries.map(([_, v]) => v)
    };
  }

  /**
   * تسجيل الأخطاء
   * Log errors
   */
  protected logError(method: string, error: any): void {
    console.error(`[${this.tableName}Repository.${method}]`, error);
  }
}

export default BaseRepository;
