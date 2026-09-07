import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  footer?: ReactNode;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export function Table<T>({ columns, rows, rowKey, onRowClick, emptyMessage = 'No records.', footer }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`border-b border-gray-200 px-3 py-2 font-medium text-gray-600 ${alignClass[col.align ?? 'left']} ${col.headerClassName ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={`border-b border-gray-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-brand-50' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2 ${alignClass[col.align ?? 'left']}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}
