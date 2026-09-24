const DEADLOCK_CODE = '40P01';

export async function withDeadlockRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.code === DEADLOCK_CODE || err?.cause?.code === DEADLOCK_CODE) {
      return fn();
    }
    throw err;
  }
}
