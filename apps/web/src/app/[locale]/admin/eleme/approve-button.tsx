"use client";

import { approveAsTender } from "./actions";

/** Approve an unknown-typed tender as a real tender (confirm-guarded). */
export function ApproveButton({ tenderId, title }: { tenderId: string; title: string }) {
  return (
    <form
      action={approveAsTender}
      onSubmit={(e) => {
        if (!window.confirm(`"${title.slice(0, 60)}…" tender olarak onaylanıp yayınlansın mı?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="tenderId" value={tenderId} />
      <button
        type="submit"
        className="whitespace-nowrap rounded border border-green-600 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
      >
        Tender olarak onayla
      </button>
    </form>
  );
}
