"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { SECTORS, COUNTRIES } from "@repo/config/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "@/server/actions/onboarding";

interface Labels {
  stepSectors: string;
  stepCountries: string;
  stepKeywords: string;
  sectorsHint: string;
  countriesHint: string;
  keywordsHint: string;
  keywordsPlaceholder: string;
  back: string;
  next: string;
  finish: string;
  error: string;
}

export function OnboardingWizard({ locale, labels }: { locale: "en" | "tr"; labels: Labels }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sectors, setSectors] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const steps = [labels.stepSectors, labels.stepCountries, labels.stepKeywords];

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function finish() {
    setError(null);
    const keywords = keywordInput
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length >= 2)
      .slice(0, 10);
    startTransition(async () => {
      const result = await completeOnboarding({ sectors, countries, keywords });
      if (result.ok) {
        router.push("/dashboard");
      } else {
        setError(result.error || labels.error);
      }
    });
  }

  const canProceed =
    step === 0 ? sectors.length > 0 : step === 1 ? countries.length > 0 : true;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <ol className="mb-8 flex items-center justify-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-primary text-white"
                  : i === step
                    ? "border-2 border-neutral-900 text-neutral-900"
                    : "border border-neutral-300 text-neutral-400"
              )}
            >
              {i < step ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                i === step ? "font-semibold text-neutral-900" : "text-neutral-400"
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-neutral-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <p className="mb-4 text-center text-sm text-neutral-500">{labels.sectorsHint}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SECTORS.map((sector) => (
              <button
                key={sector.slug}
                onClick={() => toggle(sectors, setSectors, sector.slug)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  sectors.includes(sector.slug)
                    ? "border-neutral-900 bg-primary text-white"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
                )}
              >
                {sector[locale]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="mb-4 text-center text-sm text-neutral-500">{labels.countriesHint}</p>
          <div className="flex max-h-96 flex-wrap justify-center gap-2 overflow-y-auto">
            {COUNTRIES.map((country) => (
              <button
                key={country.code}
                onClick={() => toggle(countries, setCountries, country.code)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  countries.includes(country.code)
                    ? "border-neutral-900 bg-primary text-white"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
                )}
              >
                {country[locale]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mx-auto max-w-md">
          <p className="mb-4 text-center text-sm text-neutral-500">{labels.keywordsHint}</p>
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder={labels.keywordsPlaceholder}
            className="h-11"
          />
        </div>
      )}

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      <div className="mt-10 flex justify-center gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={pending}>
            {labels.back}
          </Button>
        )}
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed}>
            {labels.next}
          </Button>
        ) : (
          <Button onClick={finish} disabled={pending}>
            {pending ? "…" : labels.finish}
          </Button>
        )}
      </div>
    </div>
  );
}
