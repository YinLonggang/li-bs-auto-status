import { useState } from 'react';
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from '../config';

function readCollapsedPreference(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedPreference(storageKey: string, isCollapsed: boolean) {
  try {
    window.localStorage.setItem(storageKey, String(isCollapsed));
  } catch {
    // Keep the shell usable when storage is blocked.
  }
}

export function usePersistentSidebarCollapse(storageKey = SIDEBAR_COLLAPSED_STORAGE_KEY) {
  const [isCollapsed, setIsCollapsedState] = useState(() =>
    readCollapsedPreference(storageKey)
  );

  const setCollapsed = (nextCollapsed: boolean) => {
    setIsCollapsedState(nextCollapsed);
    writeCollapsedPreference(storageKey, nextCollapsed);
  };

  const toggleCollapsed = () => {
    setIsCollapsedState(current => {
      const next = !current;
      writeCollapsedPreference(storageKey, next);
      return next;
    });
  };

  return { isCollapsed, setCollapsed, toggleCollapsed };
}
