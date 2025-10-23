export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize and display admin password
    const { getAdminPassword } = await import('./lib/auth');
    const { password, isGenerated } = await getAdminPassword();

    // Always log the password on startup for easy access
    console.log('\n' + '='.repeat(60));
    console.log('🔐  CONTAINER STARTUP - ADMIN CREDENTIALS');
    console.log('='.repeat(60));
    console.log(`Admin Password: ${password}`);
    console.log(`Source: ${isGenerated ? 'Generated/Redis' : 'Environment Variable'}`);
    console.log('='.repeat(60) + '\n');

    // Import and start the cron job
    await import('./lib/cron');
    console.log('[Instrumentation] Cron job initialized');
  }
}
