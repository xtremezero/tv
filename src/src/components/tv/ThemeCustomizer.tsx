'use client';

import { useEffect, useState } from 'react';
import { Palette, Moon, Sun, X, Check } from 'lucide-react';
import { useTVStore } from '@/lib/tv/store';

const ACCENT_COLORS = [
  { id: 'red', name: 'YouTube Red', hex: '#ff0000' },
  { id: 'emerald', name: 'Emerald', hex: '#10b981' },
  { id: 'cyan', name: 'Cyan', hex: '#06b6d4' },
  { id: 'amber', name: 'Amber', hex: '#f59e0b' },
  { id: 'purple', name: 'Purple', hex: '#8b5cf6' },
] as const;

export function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const themeMode = useTVStore((s) => s.themeMode);
  const accentColor = useTVStore((s) => s.accentColor);
  const setThemeMode = useTVStore((s) => s.setThemeMode);
  const setAccentColor = useTVStore((s) => s.setAccentColor);

  // Synchronize DOM classes & CSS custom properties on mount & state change
  useEffect(() => {
    const root = document.documentElement;

    // Toggle dark/light mode class
    if (themeMode === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }

    // Set --primary CSS variable for dynamic accent coloring
    const selected = ACCENT_COLORS.find((c) => c.id === accentColor) ?? ACCENT_COLORS[0];
    root.style.setProperty('--primary', selected.hex);
    root.style.setProperty('--ring', selected.hex);
    root.style.setProperty('--sidebar-primary', selected.hex);
    root.style.setProperty('--sidebar-ring', selected.hex);
  }, [themeMode, accentColor]);

  const activeHex = ACCENT_COLORS.find((c) => c.id === accentColor)?.hex ?? '#ff0000';

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* Floating Theme Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-110 active:scale-95 ring-2 ring-white/20"
          style={{ backgroundColor: activeHex }}
          title="Customize Theme & Color Mode"
          aria-label="Theme Customizer"
        >
          <Palette className="h-5 w-5 fill-white/20" />
        </button>
      )}

      {/* Popover Panel */}
      {open && (
        <div className="w-72 rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-2xl backdrop-blur-md space-y-4 animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full shadow"
                style={{ backgroundColor: activeHex }}
              />
              <span className="font-sans text-sm font-bold tracking-tight">
                Theme & Appearance
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode Switcher (Dark / Light) */}
          <div className="space-y-2">
            <span className="font-sans text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Mode
            </span>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1 border border-border">
              <button
                onClick={() => setThemeMode('dark')}
                className={`flex items-center justify-center gap-2 rounded-lg py-1.5 font-sans text-xs font-semibold transition-colors ${
                  themeMode === 'dark'
                    ? 'bg-card text-card-foreground shadow border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Moon className="h-3.5 w-3.5" /> Dark
              </button>
              <button
                onClick={() => setThemeMode('light')}
                className={`flex items-center justify-center gap-2 rounded-lg py-1.5 font-sans text-xs font-semibold transition-colors ${
                  themeMode === 'light'
                    ? 'bg-card text-card-foreground shadow border border-border font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sun className="h-3.5 w-3.5" /> Light
              </button>
            </div>
          </div>

          {/* Accent Color Swatches */}
          <div className="space-y-2">
            <span className="font-sans text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Accent Color
            </span>
            <div className="flex items-center justify-between gap-2 pt-1">
              {ACCENT_COLORS.map((c) => {
                const isSelected = accentColor === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setAccentColor(c.id)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform ${
                      isSelected ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-popover' : 'hover:scale-105 opacity-80'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
