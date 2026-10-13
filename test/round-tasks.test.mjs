import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoundTasks } from "../public/prototypes/chunjiang/round-tasks.js";

test("reset cancels old effects, frames and autoplay without touching a new round", async () => {
  let nextId = 0;
  const callbacks = new Map();
  const clock = {
    setTimeout(fn) {
      const id = ++nextId;
      callbacks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      callbacks.delete(id);
    },
    requestAnimationFrame(fn) {
      const id = ++nextId;
      callbacks.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      callbacks.delete(id);
    },
  };
  const tasks = createRoundTasks(clock);
  let effects = 0;
  tasks.later(() => effects++, 900);
  tasks.frame(() => effects++);
  const queuedOldCallbacks = [...callbacks.values()];
  const autoplayWait = tasks.wait(1000);
  tasks.clear();
  assert.equal(await autoplayWait, false);
  assert.equal(callbacks.size, 0);
  tasks.later(() => effects++, 900);
  // Even callbacks already dequeued by the browser cannot change the new round.
  for (const callback of queuedOldCallbacks) callback();
  assert.equal(effects, 0);
  for (const callback of [...callbacks.values()]) callback();
  assert.equal(effects, 1);
});
