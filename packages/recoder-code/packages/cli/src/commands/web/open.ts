/**
 * 'recoder web open' command
 * Open web project in browser
 */

import type { CommandModule } from 'yargs';
import open from 'open';
import { RecoderWebService } from '../../services/RecoderWebService.js';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';

interface OpenArgs {
  urlId: string;
}

export const openCommand: CommandModule<{}, OpenArgs> = {
  command: 'open <urlId>',
  describe: 'Open project in web browser',
  builder: (yargs) =>
    yargs.positional('urlId', {
      type: 'string',
      description: 'Project URL ID from web IDE',
      demandOption: true,
    }),
  handler: async (argv) => {
    const webService = new RecoderWebService();
    const authService = new RecoderAuthService();

    try {
      // Check authentication
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        console.error('❌ Not authenticated');
        console.log('💡 Run: recoder auth login');
        process.exit(1);
      }

      // Verify project exists first
      console.log('🔍 Verifying project...');
      await webService.getProject(argv.urlId);

      const url = webService.getProjectUrl(argv.urlId);
      console.log(`🌐 Opening project in browser...`);
      console.log(`   ${url}`);

      await open(url);

      console.log('✅ Browser opened successfully');
    } catch (error: any) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  },
};
