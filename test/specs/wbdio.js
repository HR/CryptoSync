const webdriverio = require('webdriverio');
console.log(`cwd: ${process.cwd()}`);
var options = {
    host: "localhost", // Use localhost as chrome driver server
    port: 8315,        // "9515" is the port opened by chrome driver.
    desiredCapabilities: {
        browserName: 'chrome',
        chromeOptions: {
					binary: '../../node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron',
          // binary: './CryptoSyncTest.app/Contents/MacOS/Electron', // Path to your Electron binary.
          // args: ['app=./CryptoSyncTest.app/Contents/MacOS/Electron']           // Optional, perhaps 'app=' + /path/to/your/app/
        }
    }
};

var client = webdriverio.remote(options);

// client
//   .init()
//   .setValue('#checkMasterPassInput', 'yolo#101')
//   .click('#checkMasterPass')
//   .end();

client
    .init()
    .url('http://www.google.com')
    .title(function(err, res) {
        console.log('Title was: ' + res.value);
    })
    .end();
