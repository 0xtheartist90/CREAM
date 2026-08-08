'use client';

export type SyncState = 'idle' | 'saving' | 'error';

export interface SyncStatus {
    state: SyncState;
    pending: number;
    error: string | null;
    lastSavedAt: number | null;
}

export type WriteOp = () => Promise<{ ok: boolean; error?: string }>;

/**
 * Serial write queue.
 *
 * Store mutations stay synchronous — they validate, update local state
 * optimistically, then enqueue the database write here. Running strictly in
 * order matters: "create account" must land before "create transaction that
 * references it", and two edits to the same row must not race.
 *
 * A failed op is retried once (covers a dropped connection or an expired token
 * that refreshes on the next attempt). If it still fails the queue stops and
 * surfaces the error, rather than silently continuing and leaving the local
 * view diverged from the database.
 */
export class WriteQueue {
    private queue: { label: string; op: WriteOp }[] = [];
    private running = false;
    private listeners = new Set<(s: SyncStatus) => void>();
    private status: SyncStatus = { state: 'idle', pending: 0, error: null, lastSavedAt: null };

    subscribe(fn: (s: SyncStatus) => void): () => void {
        this.listeners.add(fn);
        fn(this.status);

        return () => this.listeners.delete(fn);
    }

    getStatus(): SyncStatus {
        return this.status;
    }

    private emit(patch: Partial<SyncStatus>) {
        this.status = { ...this.status, ...patch, pending: this.queue.length };
        for (const fn of this.listeners) fn(this.status);
    }

    enqueue(label: string, op: WriteOp): void {
        this.queue.push({ label, op });
        this.emit({ state: 'saving' });
        void this.drain();
    }

    /** Clears queued work — used when switching user or discarding local state. */
    clear(): void {
        this.queue = [];
        this.emit({ state: 'idle', error: null });
    }

    private async drain(): Promise<void> {
        if (this.running) return;
        this.running = true;

        while (this.queue.length) {
            const job = this.queue[0];
            let result = await this.safeRun(job.op);

            if (!result.ok) {
                result = await this.safeRun(job.op);
            }

            if (!result.ok) {
                this.running = false;
                this.emit({ state: 'error', error: `Could not save (${job.label}): ${result.error ?? 'unknown error'}` });

                return;
            }

            this.queue.shift();
            this.emit({ state: this.queue.length ? 'saving' : 'idle', error: null, lastSavedAt: Date.now() });
        }

        this.running = false;
        this.emit({ state: 'idle', error: null });
    }

    private async safeRun(op: WriteOp): Promise<{ ok: boolean; error?: string }> {
        try {
            return await op();
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }
}
