/** A committed target must be acknowledged even when background tabs stop painting. */
export function scheduleTargetReady(notify: () => void): () => void {
  let pending = true;
  let secondFrame = 0;
  const acknowledge = () => {
    if (!pending) return;
    pending = false;
    notify();
  };
  const firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(acknowledge);
  });
  // Animation frames can pause indefinitely when another tab/browser is active.
  const fallback = setTimeout(acknowledge, 250);
  return () => {
    pending = false;
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    clearTimeout(fallback);
  };
}
