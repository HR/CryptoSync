// Test runner js for travis

var electron = require('electron-prebuilt');

var finished = child_process.spawnSync(
        electron,
        ['../index.js', 'test-file.js'],
        {stdio: 'inherit'}
    );

process.exit(finished.status);
