"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface CopilotContextType {
  isOpen: boolean;
  toggle: () => void;
  pageContext: string;
  setPageContext: (ctx: string) => void;
}

const CopilotContext = createContext<CopilotContextType>({
  isOpen: false,
  toggle: () => {},
  pageContext: "",
  setPageContext: () => {},
});

export function useCopilot() {
  return useContext(CopilotContext);
}

export default function CopilotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState("");

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <CopilotContext.Provider value={{ isOpen, toggle, pageContext, setPageContext }}>
      {children}
    </CopilotContext.Provider>
  );
}
