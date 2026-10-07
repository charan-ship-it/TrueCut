import { chromium, type Browser } from 'playwright';
import { config } from './env';

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: config.chromium,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio'],
  });
}
