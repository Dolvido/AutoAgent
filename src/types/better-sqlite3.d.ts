declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    transaction<T>(fn: () => T): () => T;
    exec(sql: string): this;
    pragma(pragma: string, simplify?: boolean): any;
    close(): void;
    function(name: string, cb: Function): void;
    aggregate(name: string, options: any): void;
    backup(destination: string | Database, options?: any): Promise<void>;
    serialize(options?: any): Buffer;
    readonly name: string;
    readonly memory: boolean;
    readonly readonly: boolean;
    readonly open: boolean;
    readonly inTransaction: boolean;
  }

  interface Statement {
    run(...params: any[]): { lastInsertRowid: number | bigint; changes: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): Iterable<any>;
    pluck(toggleState?: boolean): this;
    expand(toggleState?: boolean): this;
    raw(toggleState?: boolean): this;
    readonly source: string;
    readonly returnsData: boolean;
  }

  export default function(filename: string, options?: {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: Function;
  }): Database;
} 