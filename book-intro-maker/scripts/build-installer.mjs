// Build the desktop client/installer with mirrors for Electron and electron-builder binaries.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  npm_config_electron_mirror: process.env.npm_config_electron_mirror || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, ['scripts/build-gui.mjs']);

const builderBin = process.platform === 'win32'
  ? path.join('node_modules', '.bin', 'electron-builder.cmd')
  : path.join('node_modules', '.bin', 'electron-builder');

const args = process.argv.slice(2);
run(builderBin, args.length > 0 ? args : ['--win', 'nsis']);
