// Keep both promises and their resolution inside each request's context.
// Cross-request resolvers/chains can be canceled when another request finishes.
function release(entry) {
  const next = entry.waiters?.shift();
  if (next) next.ready = true; else entry.locked = false;
}

export async function exclusive(entry, operation) {
  if (entry.locked) {
    const waiter = { ready: false };
    (entry.waiters ||= []).push(waiter);
    const deadline = Date.now() + 10000;
    try {
      while (!waiter.ready) {
        await scheduler.wait(1);
        if (!waiter.ready && Date.now() >= deadline) throw new Error('Download coordination timed out');
      }
    } catch (error) {
      const index = entry.waiters.indexOf(waiter);
      if (index >= 0) entry.waiters.splice(index, 1);
      else if (waiter.ready) release(entry);
      throw error;
    }
  }
  else entry.locked = true;
  try { return await operation(); }
  finally { release(entry); }
}
