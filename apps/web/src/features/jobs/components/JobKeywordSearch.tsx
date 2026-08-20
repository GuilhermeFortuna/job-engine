"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveSync } from "../hooks/useLiveSync";
import { buildSearchUrl, updateSearchParams } from "../search-params";
import type { JobSearchParams } from "../types";
import { LiveSearchButton } from "./LiveSearchButton";
import { LiveSyncProgressModal } from "./LiveSyncProgressModal";

export function JobKeywordSearch({ params }: { params: JobSearchParams }) {
  const router = useRouter();
  const liveSync = useLiveSync();
  const [keywordInput, setKeywordInput] = useState(params.q ?? "");
  const [prevQ, setPrevQ] = useState(params.q);
  if (params.q !== prevQ) {
    setPrevQ(params.q);
    setKeywordInput(params.q ?? "");
  }

  const handleKeywordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordInput.trim();
    const next = updateSearchParams(
      params,
      {
        q: trimmed.length > 0 ? trimmed : undefined,
      },
      true,
    );
    router.push(buildSearchUrl(next));
  };

  return (
    <>
      <form
        role="search"
        aria-label="Job Search"
        className="flex w-full flex-col gap-2"
        onSubmit={handleKeywordSubmit}
      >
        <Label htmlFor="search-keywords" className="font-bold">
          Keywords
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="search-keywords"
            type="search"
            name="q"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Title, company, tech, or keywords..."
            className="min-w-0 flex-1"
          />
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="submit">
              <SearchIcon data-icon="inline-start" />
              Search
            </Button>
            <LiveSearchButton
              onStartSync={liveSync.startSync}
              status={liveSync.state.status}
              cooldownSeconds={liveSync.state.cooldown_remaining_seconds}
            />
          </div>
        </div>
      </form>
      <LiveSyncProgressModal
        isOpen={liveSync.isOpen}
        state={liveSync.state}
        onClose={liveSync.closeModal}
        onCancel={liveSync.cancelSync}
        onRetry={liveSync.startSync}
        liveAnnouncement={liveSync.liveAnnouncement}
      />
    </>
  );
}
