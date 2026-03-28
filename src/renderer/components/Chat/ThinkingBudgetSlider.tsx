import { useCallback } from 'react';
import { Tooltip } from '../common/Tooltip';

type ThinkingBudgetSliderProps = {
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

function formatBudget(tokens: number): string {
  if (tokens === 0) return 'Thinking: Off';
  const k = tokens / 1000;
  return `Thinking: ${k}K`;
}

export function ThinkingBudgetSlider({
  value,
  defaultValue,
  onChange,
  disabled = false,
}: ThinkingBudgetSliderProps): React.ReactElement {
  const isModified = value !== defaultValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  const handleReset = useCallback(() => {
    onChange(defaultValue);
  }, [onChange, defaultValue]);

  // Calculate the percentage position of the default marker on the track
  const defaultPercent = (defaultValue / 32000) * 100;

  return (
    <div className="flex items-center gap-3 px-2 py-1.5">
      <Tooltip content="Controls how much the agent reasons before responding.\nHigher = deeper thinking, more tokens." placement="top">
      <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500 select-none cursor-help">
        {formatBudget(value)}
      </span>
      </Tooltip>

      <div className="relative flex-1">
        {/* Default position marker */}
        {defaultValue > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full bg-zinc-500/40 pointer-events-none z-10"
            style={{ left: `${defaultPercent}%` }}
          />
        )}

        <input
          type="range"
          min={0}
          max={32000}
          step={1000}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50
            bg-zinc-300 dark:bg-zinc-700
            accent-blue-500
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-blue-500
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:disabled:cursor-not-allowed
            [&::-moz-range-thumb]:w-3.5
            [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-blue-500
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>

      {isModified && (
        <Tooltip content="Reset to agent's default thinking budget" placement="top">
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Reset to agent default"
        >
          Reset
        </button>
        </Tooltip>
      )}
    </div>
  );
}
