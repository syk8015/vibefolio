"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import ErrorState from "@/components/ErrorState";
import { useT } from "@/lib/i18n/client";

// Isolates the public profile / 명함 (business-card) page. This route renders
// user-supplied content and embeds, so it has a wider error surface — keep its
// failures contained to the page rather than the whole site.
export default function ProfileError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    logger.error("Profile route error", {
      error,
      digest: error.digest,
      scope: "profile",
    });
  }, [error]);

  const retry = unstable_retry ?? reset;
  const { t } = useT();

  return (
    <ErrorState
      title={t.theater.errorTitle}
      description={t.theater.errorBody}
      onRetry={retry ? () => retry() : undefined}
      digest={error.digest}
    />
  );
}
