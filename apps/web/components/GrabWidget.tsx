"use client";

import { useUser } from "@clerk/nextjs";
import Script from "next/script";
import { useEffect } from "react";
import { grabScriptUrl, identifyGrabUser, resetGrab } from "@/lib/grab";

export default function GrabWidget() {
  const src = grabScriptUrl();
  const { user, isLoaded } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const userId = user?.id;
  const name = user?.fullName ?? undefined;

  // Identify the signed-in human so nobody is asked who they are. The cleanup
  // resets on sign-out or when the person changes.
  useEffect(() => {
    if (!src || !isLoaded || !userId) return;
    identifyGrabUser({ email, name, userId });
    return () => resetGrab();
  }, [src, isLoaded, userId, email, name]);

  if (!src) return null; // unconfigured: no reporter, no broken script tag
  return <Script id="grab-reporter" src={src} strategy="afterInteractive" />;
}
