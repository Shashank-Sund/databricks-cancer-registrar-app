import { create } from 'zustand';

/** localStorage that never throws (private mode, blocked storage, previews). */
const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

const K = {
  theme: 'crr.theme',
  sidebar: 'crr.sidebarCollapsed',
  sections: 'crr.sectionExpanded',
};

type Theme = 'light' | 'dark';
type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

function initTheme(): Theme {
  const stored = safeStorage.get(K.theme);
  if (stored === 'light' || stored === 'dark') return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

function initSections(): Record<string, boolean> {
  const raw = safeStorage.get(K.sections);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  sectionExpanded: Record<string, boolean>;
  toasts: Toast[];
  _toastSeq: number;

  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  isSectionExpanded: (name: string) => boolean;
  toggleSection: (name: string) => void;
  setAllSections: (names: string[], expanded: boolean) => void;
  pushToast: (t: Omit<Toast, 'id'>) => number;
  dismissToast: (id: number) => void;
}

function applyThemeClass(theme: Theme) {
  try {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch {
    /* ignore */
  }
}

export const useUiStore = create<UiState>((set, get) => {
  const theme = initTheme();
  applyThemeClass(theme);

  return {
    theme,
    sidebarCollapsed: safeStorage.get(K.sidebar) === 'true',
    sectionExpanded: initSections(),
    toasts: [],
    _toastSeq: 1,

    toggleTheme: () => {
      const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
      applyThemeClass(next);
      safeStorage.set(K.theme, next);
      set({ theme: next });
    },
    setTheme: (t) => {
      applyThemeClass(t);
      safeStorage.set(K.theme, t);
      set({ theme: t });
    },
    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      safeStorage.set(K.sidebar, String(next));
      set({ sidebarCollapsed: next });
    },
    isSectionExpanded: (name) => {
      const v = get().sectionExpanded[name];
      return v === undefined ? true : v; // expanded by default
    },
    toggleSection: (name) => {
      const current = get().isSectionExpanded(name);
      const next = { ...get().sectionExpanded, [name]: !current };
      safeStorage.set(K.sections, JSON.stringify(next));
      set({ sectionExpanded: next });
    },
    setAllSections: (names, expanded) => {
      const next = { ...get().sectionExpanded };
      for (const n of names) next[n] = expanded;
      safeStorage.set(K.sections, JSON.stringify(next));
      set({ sectionExpanded: next });
    },
    pushToast: (t) => {
      const id = get()._toastSeq;
      set((s) => ({ toasts: [...s.toasts, { ...t, id }], _toastSeq: s._toastSeq + 1 }));
      return id;
    },
    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  };
});
