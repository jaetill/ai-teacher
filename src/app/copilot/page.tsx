"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCopilot } from "@/components/CopilotProvider";

export default function CopilotPage() {
  const router = useRouter();
  const { isOpen, toggle } = useCopilot();

  useEffect(() => {
    if (!isOpen) toggle();
    router.replace("/");
  }, []);

  return null;
}
