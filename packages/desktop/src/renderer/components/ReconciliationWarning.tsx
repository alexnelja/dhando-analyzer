import React from 'react';

export function ReconciliationWarning({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 mb-4">
      <span className="text-amber-500 text-lg">&#9888;</span>
      <span className="text-xs text-amber-700">{message}</span>
    </div>
  );
}
