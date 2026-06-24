// Minimal in-memory Supabase mock for unit tests.
// Supports the subset of the query builder used by tenant-admin.guards.ts:
//   .from(table)
//     .select(cols, opts?) .insert(rows) .update(patch) .delete()
//     .eq(col,val) .neq(col,val)
//     .maybeSingle()  -> { data, error }
//     await q         -> { data, count, error }
// Plus .rpc(name, args) configurable.

type Row = Record<string, any>;

export interface MockDB {
  [table: string]: Row[];
}

export interface MockOptions {
  db: MockDB;
  rpc?: Record<string, (args: any) => any>;
  /** If set, simulate a permission_denied error for selects on these tables. */
  denySelectOn?: string[];
}

function applyFilters(rows: Row[], filters: Array<[string, string, any]>): Row[] {
  return rows.filter((r) =>
    filters.every(([col, op, val]) => {
      if (op === 'eq') return r[col] === val;
      if (op === 'neq') return r[col] !== val;
      return true;
    }),
  );
}

export function createSupabaseMock(opts: MockOptions) {
  const { db, rpc = {}, denySelectOn = [] } = opts;

  function from(table: string) {
    const filters: Array<[string, string, any]> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let selectOpts: { count?: 'exact'; head?: boolean } = {};
    let pendingInsert: Row[] = [];
    let pendingUpdate: Row | null = null;

    const exec = (): { data: any; count: number | null; error: any } => {
      if (denySelectOn.includes(table) && mode === 'select') {
        return { data: null, count: null, error: { message: 'permission denied', code: '42501' } };
      }
      db[table] = db[table] || [];
      if (mode === 'select') {
        const matched = applyFilters(db[table], filters);
        const data = selectOpts.head ? null : matched;
        const count = selectOpts.count === 'exact' ? matched.length : null;
        return { data, count, error: null };
      }
      if (mode === 'insert') {
        db[table].push(...pendingInsert);
        return { data: pendingInsert, count: null, error: null };
      }
      if (mode === 'update') {
        const matched = applyFilters(db[table], filters);
        matched.forEach((r) => Object.assign(r, pendingUpdate));
        return { data: matched, count: null, error: null };
      }
      if (mode === 'delete') {
        const keep = db[table].filter((r) => !applyFilters([r], filters).length);
        const removed = db[table].length - keep.length;
        db[table] = keep;
        return { data: null, count: removed, error: null };
      }
      return { data: null, count: null, error: null };
    };

    const builder: any = {
      select(_cols: string, o?: any) {
        mode = 'select';
        selectOpts = o ?? {};
        return builder;
      },
      insert(rows: Row | Row[]) {
        mode = 'insert';
        pendingInsert = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      update(patch: Row) {
        mode = 'update';
        pendingUpdate = patch;
        return builder;
      },
      delete() {
        mode = 'delete';
        return builder;
      },
      eq(col: string, val: any) {
        filters.push([col, 'eq', val]);
        return builder;
      },
      neq(col: string, val: any) {
        filters.push([col, 'neq', val]);
        return builder;
      },
      maybeSingle() {
        const r = exec();
        const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data, error: r.error });
      },
      then(resolve: any, reject?: any) {
        return Promise.resolve(exec()).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    db,
    from,
    rpc: async (name: string, args: any) => {
      const fn = rpc[name];
      if (!fn) return { data: null, error: { message: `rpc ${name} not mocked` } };
      return { data: fn(args), error: null };
    },
  };
}
