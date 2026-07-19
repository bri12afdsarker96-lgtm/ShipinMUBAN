// Download the Electron runtime through a mirror that is reachable in this workspace.
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  npm_config_electron_mirror: process.env.npm_config_electron_mirror || 'https://npmmirror.com/mirrors/electron/',
};

const result = spawnSync(process.execPath, ['node_modules/electron/install.js'], {stdio: 'inherit', env});
process.exit(result.status ?? 1);
