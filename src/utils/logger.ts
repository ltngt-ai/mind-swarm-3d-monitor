// Simple logging utility with levels and runtime control

type Level = 'error' | 'warn' | 'info' | 'debug';
import { eventBus, Events } from './EventBus';

const LEVELS: Record<Level, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function parseLevel(input: string | null | undefined): Level | null {
  const v = (input || '').toLowerCase();
  if (v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
  if (v === '1' || v === 'true' || v === 'verbose') return 'debug';
  return null;
}

function getSearchParamLevel(): Level | null {
  try {
    const url = new URL(window.location.href);
    // Support ?log=info|debug and legacy ?debug=1
    return (
      parseLevel(url.searchParams.get('log')) ||
      parseLevel(url.searchParams.get('debug'))
    );
  } catch {
    return null;
  }
}

function getEffectiveLevel(): Level {
  // Precedence: URL param > localStorage > env > defaults
  const fromUrl = getSearchParamLevel();
  if (fromUrl) return fromUrl;

  const fromStorage = parseLevel(localStorage.getItem('LOG_LEVEL'));
  if (fromStorage) return fromStorage;

  const fromEnv = parseLevel((import.meta as any).env?.VITE_LOG_LEVEL);
  if (fromEnv) return fromEnv;

  // Defaults: more talkative in dev, quieter in prod
  const isDev = (import.meta as any).env?.DEV;
  return isDev ? 'info' : 'warn';
}

let currentLevel: Level = getEffectiveLevel();

export function setLevel(level: Level) {
  currentLevel = level;
}

function shouldLog(level: Level): boolean {
  return LEVELS[level] <= LEVELS[currentLevel];
}

function toMessage(args: any[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');
}

export const logger = {
  level(): Level {
    return currentLevel;
  },
  setLevel(level: Level) {
    currentLevel = level;
  },
  error: (...args: any[]) => {
    if (shouldLog('error')) {
      console.error(...args);
      eventBus.emit(Events.LOG_ENTRY, { level: 'error', source: 'App', message: toMessage(args) });
    }
  },
  warn: (...args: any[]) => {
    if (shouldLog('warn')) {
      console.warn(...args);
      eventBus.emit(Events.LOG_ENTRY, { level: 'warning', source: 'App', message: toMessage(args) });
    }
  },
  info: (...args: any[]) => {
    if (shouldLog('info')) {
      console.info(...args);
      eventBus.emit(Events.LOG_ENTRY, { level: 'info', source: 'App', message: toMessage(args) });
    }
  },
  debug: (...args: any[]) => {
    if (shouldLog('debug')) {
      console.debug(...args);
      eventBus.emit(Events.LOG_ENTRY, { level: 'debug', source: 'App', message: toMessage(args) });
    }
  },
};

export default logger;
