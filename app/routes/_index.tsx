import { useEffect, useState, type ComponentType } from 'react';
export default function IndexRoute() {
  const [Studio, setStudio] = useState<ComponentType | null>(null);
  useEffect(() => {
    let mounted = true;
    void import('~/components/Studio.client').then(module => {
      if (mounted) setStudio(() => module.default);
    });
    return () => { mounted = false; };
  }, []);
  return Studio ? <Studio /> : <div className="h-screen bg-[#0b0d14]" />;
}
