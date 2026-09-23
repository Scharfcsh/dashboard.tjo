"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// A shared clock for relative timestamps. It starts at the server's render time
// (so server and client markup match), then ticks on the client.

const NowContext = createContext<number>(0);

export function NowProvider({ initial, children, intervalMs = 5_000 }: { initial: string; children: ReactNode; intervalMs?: number }) {
  const initialMs = Date.parse(initial);
  const [now, setNow] = useState(initialMs);
  useEffect(() => {
    const tick = () => setNow(Math.max(Date.now(), initialMs));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [initialMs, intervalMs]);
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

export const useNow = () => useContext(NowContext);
