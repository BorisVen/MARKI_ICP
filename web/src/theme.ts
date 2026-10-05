// Theme choice: dark, light or follow the system. Stored per device.

export type ThemeChoice = 'dark' | 'light' | 'system';
const KEY = 'marki.theme';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function apply(choice: ThemeChoice) {
  const light = choice === 'light' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f5f7fb' : '#0b0f14');
}

export function setTheme(choice: ThemeChoice) {
  try { localStorage.setItem(KEY, choice); } catch { /* storage blocked */ }
  apply(choice);
}

export function initTheme() {
  apply(getTheme());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getTheme() === 'system') apply('system');
  });
}
