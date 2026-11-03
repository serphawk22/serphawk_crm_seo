/** Routine refreshes pause while hidden. Each poll owns one cancellable request. */
export function createVisiblePoll(task: (signal: AbortSignal) => Promise<void>, interval: number, immediate = true) {
  let disposed = false;
  let running = false;
  let resumePending = false;
  let controller: AbortController | null = null;
  const refresh = async () => {
    if (disposed || document.visibilityState !== "visible" || running) return;
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
  const visibility = () => {
    if (document.visibilityState === "visible") {
      if (running) resumePending = true;
      else void refresh();
    } else {
      controller?.abort();
    }
  };
  const timer = setInterval(() => { void refresh(); }, interval);
  document.addEventListener("visibilitychange", visibility);
  if (immediate) void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      clearInterval(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
