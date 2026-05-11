"use client";

import { useEffect } from "react";

export default function ViewTracker({ username }: { username: string }) {
  useEffect(() => {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, referrer: document.referrer }),
    }).catch(() => {});
  }, [username]);

  return null;
}
