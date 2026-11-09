/** Stop passive requests after two minutes without interaction, even in a visible tab. */
const IDLE_MS = 120_000;
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const;
let lastInputAt = Date.now();

/** Routine refreshes pause while hidden or idle. Each poll owns one cancellable request. */
export function createVisiblePoll(task: (signal: AbortSignal) => Promise<void>, interval: number, immediate = true) {
  let disposed = false;
  let running = false;
  let resumePending = false;
  let controller: AbortController | null = null;
  let lastActivity = lastInputAt;
  const refresh = async () => {
    if (disposed || document.visibilityState !== "visible" || Date.now() - lastActivity >= IDLE_MS || running) return;
    running = true;
    controller = new AbortController();
    try {
      await task(controller.signal);
    } catch {
      // Callers retain their existing UI error handling; timer failures are nonfatal.
    } finally {
      running = false;
      if (resumePending) {
        resumePending = false;
        void refresh();
      }
    }
  };
  const input = () => {
    const wasIdle = Date.now() - lastActivity >= IDLE_MS;
    lastActivity = Date.now();
    lastInputAt = lastActivity;
    if (wasIdle) void refresh();
  };
  const visibility = () => {
    if (document.visibilityState === "visible") {
      lastActivity = Date.now();
      lastInputAt = lastActivity;
      if (running) resumePending = true;
      else void refresh();
    } else {
      controller?.abort();
    }
  };
  const timer = setInterval(() => { void refresh(); }, interval);
  document.addEventListener("visibilitychange", visibility);
  INPUT_EVENTS.forEach(event => window.addEventListener(event, input, { passive: true }));
  if (immediate) void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      clearInterval(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
      INPUT_EVENTS.forEach(event => window.removeEventListener(event, input));
    },
  };
}
