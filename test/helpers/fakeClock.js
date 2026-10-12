// -----------------------------------------------------------------------------
// Manual timers: the tests move time forward instead of waiting for it.
// -----------------------------------------------------------------------------

/** Let every pending promise chain run. */
export async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

export function createFakeClock(start = 1_000_000) {
  let time = start;
  let nextId = 1;
  const pending = new Map();

  return {
    now: () => time,
    timers: {
      setTimeout(callback, delay = 0) {
        const id = nextId++;
        pending.set(id, { at: time + Math.max(0, delay), callback });
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      },
    },
    /** Number of timers waiting. */
    get pendingCount() {
      return pending.size;
    },
    /** Move time forward, running the timers due on the way (in order). */
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) {
          break;
        }
        const [id, timer] = due;
        pending.delete(id);
        time = Math.max(time, timer.at);
        timer.callback();
        await flush();
      }
      time = end;
      await flush();
    },
  };
}
