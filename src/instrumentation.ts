export async function register() {
    // Only run in the Node.js server process, not the Edge runtime
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { scheduler } = await import('./lib/scheduler');
        scheduler.start();
    }
}
