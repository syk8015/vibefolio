"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import ErrorState from "@/components/ErrorState";
import { useT } from "@/lib/i18n/client";

// Isolates the dashboard. The dashboard is client-heavy (lazy-loaded tabs,
// realtime, optimistic updates); keeping its boundary here means a failure in
// one tab degrades gracefully instead of taking the rest of the app down.
export default function DashboardError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const { t } = useT();

  useEffect(() => {
    logger.error("Dashboard route error", {
      error,
      digest: error.digest,
      scope: "dashboard",
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <ErrorState
      title={t.dashboard.errorTitle}
      description={t.dashboard.errorBody}
      onRetry={retry ? () => retry() : undefined}
      digest={error.digest}
    />
  );
}
