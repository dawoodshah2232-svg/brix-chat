// Brix Chat — dashboard theme (light/dark), persisted per agent in
// localStorage ('brixchat_theme'). Applied by toggling the `dark` class on
// <html>; the override block in src/index.css restyles dashboard surfaces.

export type Theme = 'light' | 'dark';

const KEY = 'brixchat_theme';

function agentKey(agent: string): string {
  return `${KEY}:${agent}`;
}

export function getTheme(agent: string): Theme {
  try {
    return localStorage.getItem(agentKey(agent)) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(agent: string, theme: Theme): void {
  try {
    localStorage.setItem(agentKey(agent), theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  try {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch {
    /* ignore */
  }
}

export function toggleTheme(agent: string): Theme {
  const next: Theme = getTheme(agent) === 'dark' ? 'light' : 'dark';
  setTheme(agent, next);
  return next;
}
