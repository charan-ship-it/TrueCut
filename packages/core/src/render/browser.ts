import { chromium, type Browser } from 'playwright';
import { config } from '@truecut/config';

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: config.chromium,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio'],
    // the worker owns shutdown: on SIGTERM it lets running renders finish before exiting
    handleSIGTERM: false, handleSIGINT: false, handleSIGHUP: false,
  });
}
