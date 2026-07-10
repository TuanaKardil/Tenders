"use client";

import { useTranslations } from "next-intl";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">{t("errorTitle")}</h1>
      <p className="mt-2 text-sm text-neutral-500">{t("errorHint")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
      >
        {t("retry")}
      </button>
    </main>
  );
}
