import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleTargetReady } from "../app/lib/targetReady";

test("target readiness survives paused frames and cancels stale rounds", (t) => {
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  let id = 0;
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => {
    timers.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, "clearTimeout", (handle: number) => { timers.delete(handle); });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true, value: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true, value: (handle: number) => { frames.delete(handle); },
  });
  const paint = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(0));
  };
  const elapse = () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach(callback => callback());
  };
  try {
    let notifications = 0;
    const cancel = scheduleTargetReady(() => notifications++);
    paint();
    assert.equal(notifications, 0, "visible target waits for the second paint");
    paint();
    assert.equal(notifications, 1);
    elapse();
    assert.equal(notifications, 1, "fallback must not duplicate an acknowledgment");
    cancel();

    const cancelBackground = scheduleTargetReady(() => notifications++);
    elapse();
    assert.equal(notifications, 2, "background player acknowledges without painting");
    paint();
    paint();
    assert.equal(notifications, 2, "resuming the tab must not duplicate the acknowledgment");
    cancelBackground();

    const cancelStale = scheduleTargetReady(() => notifications++);
    paint();
    cancelStale();
    paint();
    elapse();
    assert.equal(notifications, 2, "leaving a round cancels both pending paths");
  } finally {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  }
});
