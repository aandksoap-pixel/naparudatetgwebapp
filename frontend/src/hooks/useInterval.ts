import { useEffect, useRef } from 'react';

/**
 * setInterval с актуальным колбэком и возможностью «паузы» (delay === null).
 */
export function useInterval(
  callback: () => void,
  delay: number | null,
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null || delay <= 0) return;
    const id = window.setInterval(() => {
      callbackRef.current();
    }, delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
