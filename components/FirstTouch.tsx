"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/analytics-client";

// Mounted once in the root layout: records the visitor's first-ever landing
// (referrer + UTM) into localStorage so signup can be attributed to a source.
// Renders nothing, fires once, never throws.
export default function FirstTouch() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}
