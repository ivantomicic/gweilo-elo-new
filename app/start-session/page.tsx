"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWebHaptics } from "web-haptics/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SessionCreationGuard } from "@/components/auth/session-creation-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SessionFormat = "singles" | "mixed";

const PLAYER_OPTIONS = [2, 3, 4, 5, 6] as const;
const FORMAT_OPTIONS = ["singles", "mixed"] as const;

function StartSessionPageContent() {
  const router = useRouter();
  const { trigger } = useWebHaptics();
  const [selectedPlayers, setSelectedPlayers] = useState<number | null>(null);
  const [fourPlayerFormat, setFourPlayerFormat] =
    useState<SessionFormat>("mixed");
  const [sixPlayerFormat, setSixPlayerFormat] =
    useState<SessionFormat>("mixed");

  const selectedFormat =
    selectedPlayers === 4
      ? fourPlayerFormat
      : selectedPlayers === 6
      ? sixPlayerFormat
      : null;
  const formatCopy =
    selectedPlayers === 6
      ? t.startSession.sixPlayerFormat
      : t.startSession.fourPlayerFormat;

  const selectPlayerCount = (count: number) => {
    void trigger();
    setSelectedPlayers(count);
  };

  const selectFormat = (format: SessionFormat) => {
    void trigger();
    if (selectedPlayers === 6) {
      setSixPlayerFormat(format);
    } else {
      setFourPlayerFormat(format);
    }
  };

  const continueToPlayers = () => {
    if (selectedPlayers === null) return;

    void trigger();
    const formatParam = selectedFormat ? `&format=${selectedFormat}` : "";
    router.push(
      `/start-session/players?count=${selectedPlayers}${formatParam}`,
    );
  };

  return (
    <AppShell
      title={t.startSession.title}
      contentClassName="mx-auto w-full max-w-xl md:pt-10"
    >
      <div className="flex flex-col gap-8">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#9c61ff]">
              {t.startSession.stepIndicator}
            </p>
            <p className="text-xs font-semibold tabular-nums text-muted-foreground">
              {selectedPlayers === null
                ? "Izaberi 2–6"
                : `${selectedPlayers} igrača`}
            </p>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            {t.startSession.subtitle}
          </p>
        </header>

        <section aria-labelledby="player-count-title" className="space-y-3">
          <h2
            id="player-count-title"
            className="text-xs font-black uppercase tracking-[0.16em] text-[#9c61ff]"
          >
            {t.startSession.numberOfPlayers}
          </h2>

          <div
            role="radiogroup"
            aria-label={t.startSession.numberOfPlayers}
            className="grid grid-cols-5 gap-1 rounded-full border border-white/[0.13] bg-[#14121b] p-1 shadow-[0_12px_30px_rgba(0,0,0,0.24)]"
          >
            {PLAYER_OPTIONS.map((count) => {
              const isSelected = selectedPlayers === count;

              return (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${count} igrača`}
                  onClick={() => selectPlayerCount(count)}
                  className={cn(
                    "touch-safe h-12 rounded-full font-heading text-lg font-bold tabular-nums outline-none transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[#c2ff1f] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isSelected
                      ? "bg-[#c2ff1f] text-[#050506] shadow-[0_5px_16px_rgba(194,255,31,0.18)]"
                      : "text-foreground hover:bg-white/[0.06]",
                  )}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </section>

        {selectedFormat && (
          <section aria-labelledby="session-format-title" className="space-y-3">
            <h2
              id="session-format-title"
              className="text-xs font-black uppercase tracking-[0.16em] text-[#9c61ff]"
            >
              {formatCopy.title}
            </h2>

            <div
              role="radiogroup"
              aria-label={formatCopy.title}
              className="grid grid-cols-2 gap-1 rounded-full border border-white/[0.13] bg-[#14121b] p-1"
            >
              {FORMAT_OPTIONS.map((format) => {
                const option = formatCopy[format];
                const isSelected = selectedFormat === format;

                return (
                  <button
                    key={format}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => selectFormat(format)}
                    className={cn(
                      "touch-safe min-h-12 rounded-full px-3 text-sm font-bold outline-none transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#9c61ff] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isSelected
                        ? "bg-[#2b2637] text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    {option.title}
                  </button>
                );
              })}
            </div>

            <p className="px-1 text-sm leading-6 text-muted-foreground">
              {formatCopy[selectedFormat].description}
            </p>
          </section>
        )}

        <div className="flex items-start gap-3 px-1 text-sm leading-6 text-muted-foreground">
          <Icon
            icon="solar:info-circle-bold"
            className="mt-0.5 size-5 shrink-0 text-[#9c61ff]"
          />
          <p>{t.startSession.info}</p>
        </div>

        <Button
          disabled={selectedPlayers === null}
          onClick={continueToPlayers}
          className="touch-safe h-14 w-full rounded-full bg-[#c2ff1f] px-6 text-base font-bold text-[#050506] shadow-[0_10px_28px_rgba(194,255,31,0.16)] transition-[transform,background-color,opacity] duration-150 ease-out hover:bg-[#d0ff51] active:scale-[0.97] disabled:bg-[#14121b] disabled:text-muted-foreground disabled:shadow-none"
        >
          <span>{t.startSession.continue}</span>
          <Icon icon="solar:arrow-right-linear" className="size-5" />
        </Button>
      </div>
    </AppShell>
  );
}

export default function StartSessionPage() {
  return (
    <AuthGuard>
      <SessionCreationGuard>
        <StartSessionPageContent />
      </SessionCreationGuard>
    </AuthGuard>
  );
}
