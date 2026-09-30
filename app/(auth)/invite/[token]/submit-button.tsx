"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Pending-aware submit; degrades to a plain submit button without JS. */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
