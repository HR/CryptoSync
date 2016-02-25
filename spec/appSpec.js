// require('chromedriver');
const webdriverio = require('webdriverio');

var options = {
	host: "localhost", // Use localhost as chrome driver server
	port: 9515, // "9515" is the port opened by chrome driver.
	desiredCapabilities: {
		browserName: 'chrome',
		chromeOptions: {
			binary: 'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron',
			args: [ /* 'app=../' */ ]
		}
	}
};

var client = webdriverio.remote(options);

client
	.init()
	.url('http://google.co.uk')
	.setValue('#q', 'webdriverio')
	.click('#btnG')
	.getTitle().then(function (title) {
		console.log('Title was: ' + title);
	})
	.end();
