"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import ErrorState from "@/components/ErrorState";

// Root segment boundary. Catches render errors from the landing page and any
// route segment that does not define its own error.tsx, so a single throw can
// never blank out the whole site — it does NOT wrap the root layout (see
// app/global-error.tsx for that).
export default function AppError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16.2 renamed the recovery prop to `unstable_retry`; `reset` is kept as
  // a fallback so this stays correct across patch versions.
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled route error", {
      error,
      digest: error.digest,
      scope: "root",
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <ErrorState
      title="페이지를 불러오지 못했어요"
      description="잠시 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요."
      onRetry={retry ? () => retry() : undefined}
      digest={error.digest}
    />
  );
}
