"use client";
// Adapted from shadcn/ui use-toast (Radix-based).
import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 4;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function dispatch(next: (prev: State) => State) {
  memoryState = next(memoryState);
  listeners.forEach((l) => l(memoryState));
}

function scheduleRemoval(id: string) {
  if (timeouts.has(id)) return;
  const t = setTimeout(() => {
    timeouts.delete(id);
    dispatch((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, TOAST_REMOVE_DELAY);
  timeouts.set(id, t);
}

export function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();
  const update = (p: Partial<ToasterToast>) =>
    dispatch((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...p } : t)),
    }));
  const dismiss = () =>
    dispatch((s) => ({
      toasts: s.toasts.map((t) =>
        t.id === id ? { ...t, open: false } : t,
      ),
    }));

  dispatch((s) => ({
    toasts: [
      {
        ...props,
        id,
        open: true,
        onOpenChange: (open: boolean) => {
          if (!open) {
            dismiss();
            scheduleRemoval(id);
          }
        },
      },
      ...s.toasts,
    ].slice(0, TOAST_LIMIT),
  }));

  return { id, update, dismiss };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return {
    ...state,
    toast,
    dismiss: (id: string) =>
      dispatch((s) => ({
        toasts: s.toasts.map((t) =>
          t.id === id ? { ...t, open: false } : t,
        ),
      })),
  };
}
