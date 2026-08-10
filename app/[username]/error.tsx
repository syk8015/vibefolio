"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import ErrorState from "@/components/ErrorState";

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

  return (
    <ErrorState
      title="명함을 불러오지 못했어요"
      description="이 페이지를 표시하는 중 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요."
      onRetry={retry ? () => retry() : undefined}
      digest={error.digest}
    />
  );
}
