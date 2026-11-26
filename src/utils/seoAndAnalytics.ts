export interface AnalyticsEvent {
  id: string;
  event: string;
  page: string;
  detail: string;
  timestamp: string;
}

const ANALYTICS_STORAGE_KEY = 'fl_adv_analytics_v1';

const INITIAL_ANALYTICS_EVENTS: AnalyticsEvent[] = [];

export function getAnalyticsEvents(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_ANALYTICS_EVENTS;
  } catch {
    return INITIAL_ANALYTICS_EVENTS;
  }
}

export function clearAnalyticsEvents(): AnalyticsEvent[] {
  try {
    localStorage.removeItem(ANALYTICS_STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
}

export function trackAnalyticsEvent(
  event: string,
  page: string,
  detail: string
): AnalyticsEvent[] {
  const current = getAnalyticsEvents();
  const next: AnalyticsEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    event,
    page,
    detail,
    timestamp: new Date().toISOString(),
  };
  const updated = [next, ...current].slice(0, 50);
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function updatePageSEO(title: string, description: string): void {
  document.title = title;

  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) {
      el.setAttribute('content', content);
    }
  };

  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);
}
