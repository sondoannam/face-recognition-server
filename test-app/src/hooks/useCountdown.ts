import { useCallback, useEffect, useRef, useState } from "react";

export function useCountdown(initial: number = 3) {
  const [count, setCount] = useState(initial);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const start = useCallback(() => {
    setCount(initial);
    setRunning(true);
  }, [initial]);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, stop]);

  const reset = useCallback(() => {
    setCount(initial);
  }, [initial]);

  return { count, running, start, stop, reset };
}
