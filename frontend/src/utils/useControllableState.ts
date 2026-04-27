import { useCallback, useState } from "react";

type StateUpdater<T> = T | ((currentValue: T) => T);

interface ControllableStateOptions<T> {
  value?: T;
  defaultValue: T;
  onChange?: (value: T) => void;
}

export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: ControllableStateOptions<T>): [T, (nextValue: StateUpdater<T>) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : uncontrolledValue;

  const setValue = useCallback(
    (nextValue: StateUpdater<T>) => {
      const resolvedValue =
        typeof nextValue === "function" ? (nextValue as (currentValue: T) => T)(currentValue) : nextValue;

      if (!isControlled) {
        setUncontrolledValue(resolvedValue);
      }

      onChange?.(resolvedValue);
    },
    [currentValue, isControlled, onChange],
  );

  return [currentValue, setValue];
}
