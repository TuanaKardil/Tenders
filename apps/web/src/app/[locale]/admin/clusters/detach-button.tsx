"use client";

import { detachFromCluster } from "./actions";

/** Detach with a native confirm dialog — guards against accidental clicks. */
export function DetachButton({ tenderId, title }: { tenderId: string; title: string }) {
  return (
    <form
      action={detachFromCluster}
      onSubmit={(e) => {
        if (!window.confirm(`"${title.slice(0, 60)}…" bu cluster'dan ayrılsın mı?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="tenderId" value={tenderId} />
      <button
        type="submit"
        className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
      >
        Ayır
      </button>
    </form>
  );
}
