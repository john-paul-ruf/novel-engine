import { useState, useEffect } from 'react';
import { randomRespondingStatus } from '@domain/statusMessages';

/**
 * Returns a status string that automatically cycles through random fun messages
 * every 15–30 seconds while `active` is true.
 *
 * Call with `active = isStreaming && !isThinking && !hasResponse`.
 * The text resets to a fresh random pick each time `active` transitions to true,
 * then keeps rotating until `active` becomes false.
 */
export function useRotatingStatus(active: boolean): string {
  const [text, setText] = useState<string>(() => randomRespondingStatus());

  useEffect(() => {
    if (!active) return;

    // Pick a fresh phrase immediately when the waiting phase begins
    setText(randomRespondingStatus());

    // Schedule the next rotation using a self-rescheduling timeout so each
    // interval is independently randomised in the 15–30 s window.
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = (): void => {
      const delay = 3_000 + Math.random() * 5_000; // 3 000–8 000 ms — lively rotation
      timer = setTimeout(() => {
        setText(randomRespondingStatus());
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => clearTimeout(timer);
  }, [active]);

  return text;
}
