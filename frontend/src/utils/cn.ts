import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom radius and shadow tokens so they override, not stack.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "card", "pill"],
      shadow: ["card", "glow"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
