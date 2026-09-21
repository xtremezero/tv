'use client';

import { useEffect, useState } from 'react';
import { Power } from 'lucide-react';

interface PowerCurtainProps {
  onPowerOn: () => void;
}

/**
 * Ambient user-interface curtain. Satisfies the browser's user-gesture
 * requirement for unmuted autoplay, initializes the Web Audio context and
 * fades the master volume in — emulating a vintage television power switch.
 */
export function PowerCurtain({ onPowerOn }: PowerCurtainProps) {
  const [fading, setFading] = useState(false);

  const engage = () => {
    if (fading) return;
    setFading(true);
    setTimeout(onPowerOn, 450);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        engage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
     
  }, [fading]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-500 ${
        fading ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      onClick={engage}
      role="button"
      aria-label="Power on the television"
      data-testid="power-curtain"
    >
      <div className="crt-phosphor-frame opacity-40" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="power-ring group cursor-pointer" data-testid="power-ring">
          <Power className="h-12 w-12 text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.9)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
        </div>
        <div className="text-center font-mono">
          <p className="osd-glow text-2xl tracking-[0.35em] text-emerald-400 sm:text-3xl">POWER ON</p>
          <p className="mt-4 text-xs tracking-[0.2em] text-emerald-200/60 sm:text-sm">
            PRESS SPACE OR CLICK TO START BROADCAST
          </p>
          <p className="mt-2 text-[10px] tracking-[0.2em] text-emerald-200/40">
            AUDIO WILL BE ENABLED
          </p>
        </div>
      </div>
      <p className="absolute bottom-8 z-10 font-mono text-[10px] tracking-[0.3em] text-emerald-200/30">
        PSEUDO-LINEAR TELEVISION SYSTEM · CHANNEL DECODER READY
      </p>
    </div>
  );
}
