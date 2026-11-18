import { registerSW } from 'virtual:pwa-register';

type UpdateListener = (available: boolean) => void;

let initialized = false;
let updateAvailable = false;
let bootVersion: string | null = null;
let swRegistration: ServiceWorkerRegistration | undefined;
let triggerSWRefresh: ((reloadPage?: boolean) => Promise<void>) | undefined;
const listeners = new Set<UpdateListener>();

function notifyListeners() {
  for (const listener of listeners) {
    listener(updateAvailable);
  }
}

function markUpdateAvailable() {
  if (updateAvailable) return;
  updateAvailable = true;
  notifyListeners();
}

export function subscribePWAUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export async function checkForAppUpdateNow(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    await swRegistration?.update();
  } catch {
    // ignore offline / transient SW update errors
  }

  try {
    const res = await fetch(`/api/app-version?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = (await res.json()) as { ok?: boolean; version?: string };
    const version = String(data?.version || '').trim();
    if (!version || version === 'dev') return;

    if (!bootVersion) {
      bootVersion = version;
    } else if (version !== bootVersion) {
      await swRegistration?.update().catch(() => {});
      markUpdateAvailable();
    }
  } catch {
    // ignore network failure when offline
  }
}

export async function applyPWAUpdate(): Promise<void> {
  try {
    if (triggerSWRefresh) {
      await triggerSWRefresh(true);
    }
  } catch {
    // fallback reload below
  }
  window.location.reload();
}

export function initPWAUpdateListener(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const hadControllerOnBoot =
    'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadControllerOnBoot) {
        markUpdateAvailable();
      }
    });
  }

  triggerSWRefresh = registerSW({
    immediate: true,
    onNeedRefresh() {
      markUpdateAvailable();
    },
    onRegisteredSW(_swUrl, registration) {
      swRegistration = registration;
    },
  });

  // Récupération de la version initiale + vérifications périodiques (60 s)
  void checkForAppUpdateNow();

  window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void checkForAppUpdateNow();
    }
  }, 60_000);

  window.addEventListener('focus', () => {
    void checkForAppUpdateNow();
  });

  window.addEventListener('online', () => {
    void checkForAppUpdateNow();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForAppUpdateNow();
    }
  });
}
