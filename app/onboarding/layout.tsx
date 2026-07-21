import type { Metadata } from "next";

// Onboarding is a transient, logged-in-only step. The page itself is a Client
// Component (can't export metadata), so this thin server layout carries the
// noindex — keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
