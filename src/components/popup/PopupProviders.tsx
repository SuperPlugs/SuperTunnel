"use client";

import React from "react";
import "@/app/globals.css";

export default function PopupProviders({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-body antialiased bg-background text-foreground w-full min-w-[320px] max-w-[420px] min-h-[360px]">
      {children}
    </div>
  );
}


