"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { useWebHaptics } from "web-haptics/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SessionCreationGuard } from "@/components/auth/session-creation-guard";
import {
	SessionCreationSectionHeading,
	SessionCreationShell,
} from "@/components/sessions/session-creation-shell";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { t } from "@/lib/i18n";

type SessionFormat = "singles" | "mixed";

const PLAYER_OPTIONS = [2, 3, 4, 5, 6] as const;
const FORMAT_OPTIONS = ["singles", "mixed"] as const;

function StartSessionPageContent() {
  const router = useRouter();
  const { trigger } = useWebHaptics();
  const reduceMotion = useReducedMotion();
  const [selectedPlayers, setSelectedPlayers] = useState<number | null>(null);
  const [fourPlayerFormat, setFourPlayerFormat] =
    useState<SessionFormat>("mixed");
  const [sixPlayerFormat, setSixPlayerFormat] =
    useState<SessionFormat>("mixed");

  useEffect(() => {
    sessionStorage.removeItem("selectedPlayers");
  }, []);

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
    <SessionCreationShell
      title="Novi termin"
      leadingAction={{
        label: "Zatvori",
        onClick: () => router.back(),
      }}
      footerLabel="Nastavi"
      onFooterAction={continueToPlayers}
      footerDisabled={selectedPlayers === null}
    >
      <div className="flex flex-col gap-5">
        <section aria-labelledby="player-count-title" className="space-y-2.5">
          <SessionCreationSectionHeading
            detail={
              selectedPlayers === null
                ? "IZABERI 2–6"
                : `0/${selectedPlayers} izabrano`
            }
          >
            <span id="player-count-title">
            {t.startSession.numberOfPlayers}
            </span>
          </SessionCreationSectionHeading>

          <SegmentedControl
            value={selectedPlayers}
            options={PLAYER_OPTIONS.map((count) => ({
              value: count,
              label: count,
              ariaLabel: `${count} igrača`,
            }))}
            onValueChange={selectPlayerCount}
            ariaLabel={t.startSession.numberOfPlayers}
            className="rounded-full [&>button]:min-h-10 [&>button]:rounded-full [&>button]:py-0 [&>button]:font-body [&>button]:text-ios-body [&>button]:font-bold [&>button[data-state=on]]:shadow-none"
          />
        </section>

        {selectedFormat && (
          <section aria-labelledby="session-format-title" className="space-y-2.5">
            <SessionCreationSectionHeading>
              <span id="session-format-title">FORMAT</span>
            </SessionCreationSectionHeading>

            <SegmentedControl
              value={selectedFormat}
              options={FORMAT_OPTIONS.map((format) => ({
                value: format,
                label: formatCopy[format].title,
              }))}
              onValueChange={selectFormat}
              ariaLabel={formatCopy.title}
              className="rounded-full [&>button]:rounded-full [&>button]:font-body [&>button]:text-ios-subheadline [&>button]:font-semibold [&>button[data-state=on]]:!bg-[rgb(var(--ds-native-muted)/0.22)] [&>button[data-state=on]]:!text-[rgb(var(--ds-native-bone))] [&>button[data-state=on]]:shadow-none"
            />
          </section>
        )}

        <video
          src="/session-creation/player-count-placeholder.mp4"
          muted
          loop
          playsInline
          autoPlay={!reduceMotion}
          preload="metadata"
          className="mx-auto aspect-square w-full max-w-md object-contain"
          aria-hidden="true"
        />
      </div>
    </SessionCreationShell>
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
