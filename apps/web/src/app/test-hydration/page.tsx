"use client";

import { useEffect, useState } from "react";

export default function TestHydrationPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    window.__HYDRATED__ = true;
  }, []);
  return (
    <main className="p-8">
      <p data-testid="mounted">{mounted ? "MOUNTED" : "SSR-ONLY"}</p>
      <button type="button" onClick={() => { window.__CLICKED__ = true; }}>
        点击我
      </button>
    </main>
  );
}
