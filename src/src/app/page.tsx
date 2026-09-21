'use client';

import dynamic from 'next/dynamic';

const TVClient = dynamic(() => import('@/components/tv/TVClient'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div className="crt-phosphor-frame opacity-40" aria-hidden />
      <p className="relative z-10 animate-pulse font-mono text-sm tracking-[0.5em] text-emerald-500">
        TUNING…
      </p>
    </div>
  ),
});

export default function Home() {
  return <TVClient />;
}
