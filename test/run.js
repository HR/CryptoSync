// Test runner js for travis

var childProcess = require('child_process'),
		electron = require('electron-prebuilt'),
		chromedriver = require('chromedriver'),
		binPath = chromedriver.path;

// var childArgs = [
//   'some argument'
// ];
//
// childProcess.execFile(binPath, childArgs, function(err, stdout, stderr) {
//   // handle results
// });
// 
// OR
// args = [
//     // optional arguments
// ];
// chromedriver.start(args);
// // run your tests
// chromedriver.stop();

var finished = child_process.spawnSync(
        electron,
        ['../index.js', 'test-file.js'],
        {stdio: 'inherit'}
    );

process.exit(finished.status);
