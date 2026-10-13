/** Own every deferred effect for one round, including cancellable autoplay waits. */
export function createRoundTasks(clock = globalThis) {
  const timers = new Map();
  const frames = new Set();
  let generation = 0;

  function later(callback, ms, onCancel) {
    const round = generation;
    const id = clock.setTimeout(() => {
      timers.delete(id);
      if (round === generation) callback();
    }, ms);
    timers.set(id, onCancel);
    return id;
  }

  return {
    later,
    wait(ms) {
      return new Promise((resolve) =>
        later(
          () => resolve(true),
          ms,
          () => resolve(false),
        ),
      );
    },
    frame(callback) {
      const round = generation;
      const id = clock.requestAnimationFrame((time) => {
        frames.delete(id);
        if (round === generation) callback(time);
      });
      frames.add(id);
    },
    clear() {
      generation++;
      for (const [id, onCancel] of timers) {
        clock.clearTimeout(id);
        onCancel?.();
      }
      timers.clear();
      for (const id of frames) clock.cancelAnimationFrame(id);
      frames.clear();
    },
  };
}
