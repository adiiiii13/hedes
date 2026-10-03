import { useEffect, useState, type ComponentType } from 'react';
export default function IndexRoute() {
  const [Studio, setStudio] = useState<ComponentType | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let mounted = true;
    void import('~/components/Studio.client').then(module => {
      if (mounted) setStudio(() => module.default);
    }).catch((error: unknown) => {
      console.error('HEDES workspace failed to load', error);
      if (mounted) setLoadError(true);
    });
    return () => { mounted = false; };
  }, []);
  if (Studio) return <Studio />;
  if (loadError) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0b0d14] px-6 text-slate-100">
        <section className="max-w-md rounded-2xl border border-rose-400/30 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-lg font-semibold">HEDES could not start</h1>
          <p className="mt-2 text-sm text-slate-400">The workspace failed to load. Check the app log, then reload HEDES.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Reload HEDES</button>
        </section>
      </main>
    );
  }
  return <div role="status" aria-label="Loading HEDES" className="h-screen bg-[#0b0d14]" />;
}
