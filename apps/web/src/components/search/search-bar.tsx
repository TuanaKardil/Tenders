"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  placeholder: string;
  buttonLabel: string;
}

export function SearchBar({ placeholder, buttonLabel }: SearchBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    next.delete("page");
    router.push(`/search?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full items-center gap-2">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
        {/* Rendered on the navy band / dark hero — light text + border. */}
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-11 border-white/25 pl-9 text-white placeholder:text-white/45 caret-white"
          name="q"
        />
      </div>
      <Button type="submit" className="h-11 px-5">
        {buttonLabel}
      </Button>
    </form>
  );
}
