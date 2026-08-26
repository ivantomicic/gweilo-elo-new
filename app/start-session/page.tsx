"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWebHaptics } from "web-haptics/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SessionCreationGuard } from "@/components/auth/session-creation-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SectionLabel } from "@/components/ui/typography";
import { t } from "@/lib/i18n";

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
            <SectionLabel>
              {t.startSession.stepIndicator}
            </SectionLabel>
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
          <SectionLabel as="h2" id="player-count-title">
            {t.startSession.numberOfPlayers}
          </SectionLabel>

          <SegmentedControl
            value={selectedPlayers}
            options={PLAYER_OPTIONS.map((count) => ({
              value: count,
              label: count,
              ariaLabel: `${count} igrača`,
            }))}
            onValueChange={selectPlayerCount}
            ariaLabel={t.startSession.numberOfPlayers}
            selection="highlight"
            size="number"
            elevated
          />
        </section>

        {selectedFormat && (
          <section aria-labelledby="session-format-title" className="space-y-3">
            <SectionLabel as="h2" id="session-format-title">
              {formatCopy.title}
            </SectionLabel>

            <SegmentedControl
              value={selectedFormat}
              options={FORMAT_OPTIONS.map((format) => ({
                value: format,
                label: formatCopy[format].title,
              }))}
              onValueChange={selectFormat}
              ariaLabel={formatCopy.title}
            />

            <p className="px-1 text-sm leading-6 text-muted-foreground">
              {formatCopy[selectedFormat].description}
            </p>
          </section>
        )}

        <div className="flex items-start gap-3 px-1 text-sm leading-6 text-muted-foreground">
          <Icon
            icon="solar:info-circle-bold"
            className="mt-0.5 size-5 shrink-0 text-ds-section-accent"
          />
          <p>{t.startSession.info}</p>
        </div>

        <Button
          disabled={selectedPlayers === null}
          onClick={continueToPlayers}
          variant="prominent"
          size="cta"
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
