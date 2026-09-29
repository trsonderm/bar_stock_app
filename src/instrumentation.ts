/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Starts the in-process background scheduler (report emails, low-stock
 * alerts, shift reports, billing, log cleanup). Set DISABLE_SCHEDULER=true to
 * skip it, e.g. in local development when you do not want emails sent.
 */
export async function register() {
    // The scheduler uses Node APIs (pg, nodemailer, child_process). This exact
    // `NEXT_RUNTIME === 'nodejs'` check lets the bundler drop the import from
    // the Edge build.
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        if (process.env.DISABLE_SCHEDULER === 'true') {
            console.log('Scheduler disabled via DISABLE_SCHEDULER');
            return;
        }
        const { scheduler } = await import('./lib/scheduler');
        scheduler.start();
    }
}
