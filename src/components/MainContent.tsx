"use client";

import { useCopilot } from "./CopilotProvider";

export default function MainContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isOpen } = useCopilot();

  return (
    <div
      className="flex flex-col flex-1 min-h-0 transition-[margin] duration-300 ease-in-out overflow-x-hidden"
      style={{ marginRight: isOpen ? "42%" : "0" }}
    >
      {children}
    </div>
  );
}
