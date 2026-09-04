"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "cadence.poc.theme";
const ORDER: Theme[] = ["system", "light", "dark"];

const ICONS: Record<Theme, React.ReactNode> = {
  system: <Monitor />,
  light: <Sun />,
  dark: <Moon />,
};

const LABELS: Record<Theme, string> = {
  system: "Match system theme",
  light: "Light theme",
  dark: "Dark theme",
};

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * The stored theme is external state, so it is read through
 * `useSyncExternalStore` rather than mirrored into component state. The `dark`
 * class is owned by the pre-paint script below and by `applyTheme`.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => {
    if (readTheme() === "system") applyTheme("system");
    onChange();
  };
  media.addEventListener("change", onMediaChange);
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onMediaChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored && ORDER.includes(stored) ? stored : "system";
}

export function ThemeToggle() {
  const theme = React.useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    for (const listener of listeners) listener();
  };

  return (
    <Tooltip content={LABELS[theme]} side="right">
      <Button variant="ghost" size="icon-sm" onClick={cycle} aria-label={LABELS[theme]}>
        {ICONS[theme]}
      </Button>
    </Tooltip>
  );
}

/** Applies the stored theme before paint to avoid a flash of the wrong palette. */
export const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var d = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (d) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
