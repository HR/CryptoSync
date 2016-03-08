var childProcess = require('child_process');
var chromedriver = require('chromedriver');
var binPath = chromedriver.path;
const webdriverio = require('webdriverio');

var childArgs = [
  'some argument'
];

childProcess.execFile(binPath, childArgs, function(err, stdout, stderr) {
  // handle results

});
