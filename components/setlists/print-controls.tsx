"use client";
import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Standalone print view: auto-open the browser print dialog once laid out.
export function PrintControls() {
  React.useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print mb-6 flex justify-end">
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Print / Save as PDF
      </Button>
    </div>
  );
}
