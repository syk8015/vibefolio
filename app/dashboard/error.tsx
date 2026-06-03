"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import ErrorState from "@/components/ErrorState";

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
      title="대시보드를 불러오지 못했어요"
      description="대시보드를 표시하는 중 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요."
      onRetry={retry ? () => retry() : undefined}
      digest={error.digest}
    />
  );
}
