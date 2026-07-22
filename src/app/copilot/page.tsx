"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCopilot } from "@/components/CopilotProvider";

export default function CopilotPage() {
  const router = useRouter();
  const { isOpen, toggle } = useCopilot();
  // Run-once guard: in dev StrictMode the effect fires twice, which used to
  // toggle the panel open then closed — deep links landed with the panel shut.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!isOpen) toggle();
    router.replace("/");
  }, [isOpen, toggle, router]);

  return null;
}
