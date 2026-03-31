import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  emptyMessage?: string;
  compact?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  keyField,
  emptyMessage = 'No data',
  compact = false,
}: DataTableProps<T>) {
  const cellPadding = compact ? 'px-3 py-1.5' : 'px-4 py-3';

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200/60" style={{ backgroundColor: '#f3f2ee' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${cellPadding} text-left font-medium text-gray-500 text-xs uppercase tracking-wide`}
                style={{ textAlign: col.align ?? 'left', width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100/60">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={`${cellPadding} text-center text-gray-400 italic`}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={String(row[keyField])}
                className="hover:bg-gray-50/60 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${cellPadding} text-gray-700`}
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
