'use strict';
const electron = require('electron');
const app = electron.app,
	BrowserWindow = electron.BrowserWindow,
	ipc = electron.ipcMain,
	Tray = electron.Tray,
	shell = electron.shell,
	fs = require('fs-plus'),
	https = require('https'),
	base64 = require('base64-stream'),
	Db = require('./src/Db'),
	crypto = require('./src/crypto'),
	OAuth = require('./src/OAuth'),
	Account = require('./src/Account'),
	Positioner = require('electron-positioner'),
	_ = require('lodash'),
	google = require(`googleapis`),
	plus = google.plus('v1');
// TODO: consider using 'q' or 'bluebird' promise libs later
// TODO: consider using arrow callback style I.E. () => {}
// YOLO$101

// MasterPass is protected (private var) and only exist in Main memory
global.MasterPass = require('./src/MasterPass');
global.gAuth = null;
global.status = null;
global.state = {};
global.paths = {
	home: `${fs.getHomeDirectory()}/CryptoSync`,
	mdb: `${app.getPath('userData')}/mdb`,
	userData: app.getPath('userData'),
	vault: `${fs.getHomeDirectory()}/CryptoSync/Vault`,
	gdriveSecret: `${app.getPath('userData')}/client_secret_gdrive.json`,
	dropboxSecret: `${app.getPath('userData')}/client_secret_dropbox.json`
};

// TODO: Get from mdb as JSON and store as JSON as one value
global.settings = {
	user: {

	},
	default: { // TODO: finalise the default settings
		keyLength: "128", // TODO: parseInt ehen read
		algorithm: "CTR", // TODO: set proper encrption arg on encryption
		randomness: "Pseudo",
		MPkeyLength: "256",
		shares: "s2n3",
		autostart: "true",
		offlineEnc: "true"
	}
};

global.views = {
	main: `file://${__dirname}/static/index.html`,
	masterpassprompt: `file://${__dirname}/static/masterpassprompt.html`,
	setup: `file://${__dirname}/static/setup.html`,
	menubar: `file://${__dirname}/static/menubar.html`,
	errorprompt: `file://${__dirname}/static/errorprompt.html`,
	settings: `file://${__dirname}/static/settings.html`,
	vault: `file://${__dirname}/static/vault.html`
};

// enable remote debugging
// app.commandLine.appendSwitch('remote-debugging-port', '8315');
// app.commandLine.appendSwitch('host-rules', 'MAP * 127.0.0.1');

// report crashes to the Electron project
// require('crash-reporter').start({
// 	 productName: 'CryptoSync',
// 	 companyName: 'CryptoSync',
// 	 submitURL: 'https://git.io/HR',
// 	 autoSubmit: false
// });

// adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')();

// prevent the following from being garbage collected
let Menubar;
/**
 * Window constructors
 **/

function Cryptobar(callback) {
	function click(e, bounds) {
		if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) {
			return hideWindow();
		}

		if (win && win.isVisible()) {
			return hideWindow();
		}

		// double click sometimes returns `undefined`
		bounds = bounds || cachedBounds;

		cachedBounds = bounds;
		showWindow(cachedBounds);
	}

	function showWindow(trayPos) {
		// Default the window to the right if `trayPos` bounds are undefined or null.
		let noBoundsPosition = null;
		if ((trayPos === undefined || trayPos.x === 0) && winPosition.substr(0, 4) === 'tray') {
			noBoundsPosition = (process.platform === 'win32') ? 'bottomRight' : 'topRight';
		}

		let position = positioner.calculate(noBoundsPosition || winPosition, trayPos);
		win.setPosition(position.x, position.y);
		win.show();
		return;
	}

	function hideWindow() {
		if (!win) {
			return;
		}
		// emit hide
		win.hide();
		// emitt after-hide
	}

	let win = new BrowserWindow({
		width: 500, // 290
		height: 312,
		frame: false,
		show: false
			// resizable: false
	});
	app.dock.hide();
	let cachedBounds;
	const winPosition = (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter';
	const positioner = new Positioner(win);
	Menubar = new Tray('static/images/mb/trayic_light.png');
	Menubar.on('click', click)
		.on('double-click', click);

	win.on('blur', hideWindow);

	win.loadURL(global.views.menubar);
	win.openDevTools();

	ipc.on('openSyncFolder', function (event) {
		console.log('IPCMAIN: openSyncFolder event emitted');
		shell.showItemInFolder(global.paths.vault);
	});

	ipc.on('quitApp', function (event) {
		console.log('IPCMAIN: quitApp event emitted, Calling app.quit()...');
		app.quit();
	});

	ipc.on('openSettings', function (event) {
		console.log('IPCMAIN: openSettings event emitted');
		createSettings(function (result) {

		});
	});

	ipc.on('openVault', function (event) {
		console.log('IPCMAIN: openVault event emitted');
		createVault(null);
	});

	win.on('closed', function () {
		console.log('win.closed event emitted for Menubar.');
		win = null;
		callback();
	});
}

function createVault(callback) {
	let win = new BrowserWindow({
		width: 800,
		height: 400,
		center: true,
		titleBarStyle: 'hidden-inset'
	});
	win.loadURL(global.views.vault);
	win.openDevTools();
	win.on('closed', function () {
		console.log('win.closed event emitted for createVault.');
		win = null;
		if (callback) callback();
	});
}

function createSetup(callback) {
	function getParam(name, url) {
		name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
			results = regex.exec(url);
		return (results === null) ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

	function streamToString(stream, cb) {
		const chunks = [];
		stream.on('data', (chunk) => {
			chunks.push(chunk);
		});
		stream.on('end', () => {
			cb(chunks.join(''));
		});
	}
	var win = new BrowserWindow({
		width: 580,
		height: 420,
		center: true,
		show: true,
		titleBarStyle: 'hidden-inset'
			// width: 400,
			// height: 460
			// resizable: false,
	});
	let setupComplete = false;
	let webContents = win.webContents;
	win.loadURL(global.views.setup);
	win.openDevTools();
	ipc.on('initAuth', function (event, type) {
		console.log('IPCMAIN: initAuth emitted. Creating Auth...');
		// if (type === 'gdrive') {
		global.gAuth = new OAuth(type, global.paths.gdriveSecret);
		global.gAuth.authorize(global.mdb, function (authUrl) {
			if (authUrl) {
				console.log(`Loading authUrl... ${authUrl}`);
				win.loadURL(authUrl, {
					'extraHeaders': 'pragma: no-cache\n'
				});
			} else {
				console.log('As already exists, loading masterpass...');
				win.loadURL(`${global.views.setup}?nav_to=masterpass`);
			}
		});
		// }
	});

	win.on('unresponsive', function (event) {
		console.log('createSetup UNRESPONSIVE');
	});

	webContents.on('will-navigate', function (event, url) {
		console.log(`IPCMAIN: will-navigate emitted,\n URL: ${url}`);
		const regex = /http:\/\/localhost/g;
		if (regex.test(url)) {
			event.preventDefault();
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			// console.log('MAIN: url matched, sending to RENDER...');
			var err = getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				var auth_code = getParam("code", url);
				console.log(`IPCMAIN: Got the auth_code, ${auth_code}`);
				console.log("IPCMAIN: Calling callback with the code...");
				// Send code to call back and redirect
				// callback(code, function(err, authed) {
				// 	// body...
				// });

				// Get auth token from auth code
				gAuth.getToken(auth_code, function (token) {
					// store auth token in mdb
					gAuth.storeToken(token, mdb);
					console.log(`IPCMAIN: token retrieved and stored: ${token}`);
					console.log(`IPCMAIN: oauth2Client retrieved: ${gAuth.oauth2Client}`);
					// create new account
					plus.people.get({
						userId: 'me',
						auth: gAuth.oauth2Client
					}, function (err, response) {
						// handle err and response
						if (err) {
							console.log(`IPCMAIN: plus.people.get error, ${err}`);
						} else {
							console.log(`IPCMAIN: plus.people.get response:`);
							console.log(`\nemail: ${response.emails[0].value}\nname: ${response.displayName}\nimage:${response.image.url}\n`);
							// TODO:
							let accName = `${response.displayName.toLocaleLowerCase().replace(/ /g,'')}_drive`;
							console.log(accName);
							https.get(response.image.url, function (res) {
								if (res.statusCode === 200) {
									let stream = res.pipe(base64.encode());
									streamToString(stream, (profileImgB64) => {
										console.log(`SUCCESS: https.get(response.image.url) retrieved response.image.url and converted into ${profileImgB64.substr(0, 20)}...`);
										global.accounts[accName] = new Account("gdrive", response.displayName, response.emails[0].value, profileImgB64,gAuth);
									});
								} else {
									console.log(`ERROR: https.get(response.image.url) failed to retrieve response.image.url, res code is ${res.statusCode}`);
								}
							});
						}
					});
				});

				webContents.on('did-finish-load', function () {
					webContents.send('authResult', null);
				});
			} else {
				webContents.on('did-finish-load', function () {
					webContents.send('authResult', err);
				});
			}
		}
	});

	ipc.on('setMasterPass', function (event, masterpass) {
		console.log('IPCMAIN: setMasterPass emitted, Setting Masterpass...');
		setMasterPass(masterpass, function (err) {
			global.MasterPass.set(masterpass);
			webContents.send('setMasterPassResult', err);
		});
	});

	ipc.on('done', function (event, masterpass) {
		console.log('IPCMAIN: done emitted, setup complete. Closing this window and opening menubar...');
		setupComplete = true;
		win.close();
	});

	win.on('closed', function () {
		console.log('IPCMAIN: win.closed event emitted for setupWindow.');
		win = null;
		if (setupComplete) {
			callback(null);
		} else {
			callback('Setup did not finish successfully');
		}
	});
}

function createSettings(callback) {
	let win = new BrowserWindow({
		width: 800,
		height: 600,
		center: true
	});
	win.loadURL(global.views.settings);
	win.openDevTools();
	ipc.on('resetMasterPass', function (event, type) {
		console.log('IPCMAIN: resetMasterPass emitted. Creating masterPassPrompt...');
		masterPassPrompt(true, function (newMPset) {
			// if (newMPset) then new new MP was set otherwise it wasn't
			// TODO: show password was set successfully
			console.log(`MAIN: masterPassPrompt, newMPset finished? ${newMPset}`);
			return;
		});
	});
	win.on('closed', function () {
		console.log('win.closed event emitted for createSettings.');
		win = null;
		callback();
	});
}

function masterPassPrompt(reset, callback) {
	// var BrowserWindow = electron.remote.BrowserWindow;
	// BrowserWindow.addDevToolsExtension('../devTools/react-devtools/shells/chrome');
	let win = new BrowserWindow({
		width: 500, // 300
		height: 435,
		center: true,
		titleBarStyle: 'hidden-inset'
			// resizable: false,
	});
	let webContents = win.webContents;
	let newMPset = false;
	if (reset) {
		win.loadURL(`${global.views.masterpassprompt}?nav_to=reset`);
	} else {
		win.loadURL(global.views.masterpassprompt);
	}
	win.openDevTools();
	ipc.on('checkMasterPass', function (event, masterpass) {
		console.log('IPCMAIN: checkMasterPass emitted. Checking MasterPass...');
		// TODO: Clean this up and remove redundancies
		checkMasterPass(masterpass, function (err, match) {
			if (err) {
				//send error
				webContents.send('checkMasterPassResult', err);
				return;
			}
			if (match) {
				console.log("IPCMAIN: PASSWORD MATCHES!");
				global.MasterPass.set(masterpass);
				console.log(`global.MasterPass.get() = ${global.MasterPass.get()}`);
				webContents.send('checkMasterPassResult', {
					err: null,
					match: match
				});
				// TODO: Open Vault and start Menubar
				// callback();
				// Db.decrypt(global.paths.vault, masspass, function(succ, err) {
				// 	// body...
				// });
				return;
			} else {
				console.log("IPCMAIN: PASSWORD DOES NOT MATCH!");
				webContents.send('checkMasterPassResult', {
					err: null,
					match: match
				});
				return;
			}
		});
	});
	ipc.on('setMasterPass', function (event, masterpass) {
		console.log('IPCMAIN: setMasterPass emitted, Setting Masterpass...');
		setMasterPass(masterpass, function (err) {
			// TODO: create new Vault, delete old data and start re-encrypting
			if (!err) {
				newMPset = true;
				global.MasterPass.set(masterpass);
				webContents.send('setMasterPassResult', null);
			} else {
				webContents.send('setMasterPassResult', err);
			}
		});
	});
	win.on('closed', function () {
		console.log('win.closed event emitted for createSettings.');
		win = null;
		callback(((reset) ? newMPset : null));
	});

	return win;
}

function createErrorPrompt(err, callback) {
	var win = new BrowserWindow({
		width: 240,
		height: 120,
		center: true,
		titleBarStyle: 'hidden-inset',
		show: true
	});
	var webContents = win.webContents;
	let res;
	win.loadURL(global.views.errorprompt);
	console.log(`ERROR PROMPT: the error is ${err}`);
	webContents.on('did-finish-load', function () {
		webContents.send('error', err);
	});

	ipc.on('response', function (event, response) {
		console.log('ERROR PROMPT: Got user response');
		res = response;
		win.close();
	});

	win.on('closed', function (response) {
		console.log('win.closed event emitted for ErrPromptWindow.');
		win = null;
		if (callback) {
			if (response) {
				callback(res);
			} else {
				callback(null);
			}
		}
	});
}

/**
 * Functions
 **/
function setMasterPass(masterpass, callback) {
	let MPhash = crypto.genPassHash(masterpass);
	console.log(`MPhash = ${MPhash}`);
	global.mdb.put('MPhash', MPhash, function (err) {
		if (err) {
			console.log(`ERROR: mdb.put('MPhash') failed, ${err}`);
			return callback(err);
			// I/O or other error, pass it up the callback
		}
		console.log(`SUCCESS: mdb.put('MPhash')`);
		return callback(null);
	});
}


function checkMasterPass(masterpass, callback) {
	global.mdb.get('MPhash', function (err, MPhash) {
		if (err) {
			if (err.notFound) {
				console.log(`ERROR: MPhash NOT FOUND, Need setMasterPass...`);
				return callback(err, null);
			}
			// I/O or other error, pass it up the callback
			console.log(`ERROR: mdb.get('MPhash') failed, ${err}`);
			return callback(err, null);
		}
		console.log(`SUCCESS: MPhash FOUND, ${MPhash}`);
		MPhash = MPhash.split("#");
		const SALT = MPhash[0];
		const MPHASH = MPhash[1];
		console.log(`SALT = ${SALT}, MPHASH = ${MPHASH}`);
		let hash = crypto.genPassHash(masterpass, SALT);
		let match = (hash === MPHASH);
		console.log(`MATCH: ${hash} === ${MPHASH} = ${match}`);
		return callback(null, match);
	});
}

function Setup() {
	// Guide user through setting up a MPhash and connecting to cloud services
	// TODO: transform into Async using a Promise
	fs.makeTreeSync(global.paths.home);
	fs.makeTreeSync(global.paths.mdb);
	fs.makeTreeSync(global.paths.vault);
	global.mdb = new Db(global.paths.mdb);
	// Setup routine
	return createSetup();
}

function init() {
	// Prompt
	// Decrypt db (the Vault) and get ready for use
	// open mdb
	global.vault = new Db(global.paths.vault, MasterPass);
}

/**
 * Event handlers
 **/

function onClosed() {
	// dereference the window
	// for multiple windows store them in an array
	// TODO: encrypt the vault before dumping on fs
	console.log('win.closed event emitted;\n Calling on onClosed');
	win = null;
}

/**
 * Event handlers
 **/
// Check for connection status
ipc.on('online-status-changed', function (event, status) {
	console.log(`APP: online-status-changed event emitted, changed to ${status}`);
});

app.on('window-all-closed', () => {
	console.log('APP: window-all-closed event emitted');
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
app.on('quit', () => {
	console.log('APP: quit event emitted');
});
app.on('will-quit', () => {
	console.log('APP: will-quit event emitted');
	console.log(`platform is ${process.platform}`);
	// TODO: Cease any db OPs; encrypt vault before quitting the app and dump to fs
	if (global.accounts[Object.keys(global.accounts)[0]].changed) {
		console.log(`APP.ON('will-quit'): ${global.accounts[Object.keys(global.accounts)[0]]} was changed`);
		global.mdb.put('accounts', JSON.stringify(global.accounts), function (err) {
			if (err) {
				console.log(`ERROR: mdb.put('accounts') failed, ${err}`);
				// I/O or other error, pass it up the callback
			}
			console.log(`SUCCESS: mdb.put('accounts')`);
		});
	}
	if (!(_.isEmpty(global.settings.user))) {
		console.log("global.settings.user is not empty, JSON.stringifying & saving in mdb...");
		global.mdb.put('userConfig', JSON.stringify(global.settings.user), function (err) {
			if (err) {
				console.log(`ERROR: mdb.put('userConfig') failed, ${err}`);
				// I/O or other error, pass it up the callback
			}
			console.log(`SUCCESS: mdb.put('userConfig')`);
		});
	}
	console.log('Closing vault and mdb. Calling vault.close() and mdb.close()');
	// global.vault.close();
	global.mdb.close();
});

// app.on('activate', function(win) {
// 	console.log('activate event emitted');
// 	if (!win) {
// 		win = createMainWindow();
// 	}
// });

app.on('ready', function () {
	// TODO: Wrap all this into init();
	// let firstRun = (!fs.isDirectorySync(global.paths.home)) && (!fs.isFileSync(global.paths.mdb));
	if (false) {
		// TODO: Do more extensive FIRST RUN check
		console.log('First run. Creating Setup wizard...');
		// Setup();
		// TODO: Wrap Setup around createSetup and call Setup the way its being called now
		// Run User through Setup/First Install UI
		global.mdb = new Db(global.paths.mdb);
		// global.mdb.del('gdrive-token', function (err) {
		// 	if (err) console.log(`Error retrieving gdrive-token, ${err}`);
		// 	console.log("deleted gdrive-token");
		// });
		global.accounts = {};
		createSetup(function (err) {
			if (err) {
				console.log(err);
				createErrorPrompt(err, function (response) {
					console.log(`ERRPROMT response: ${response}`);
					if (response === 'retry') {
						// TODO: new createSetup
						createSetup(null);
					} else {
						// TODO: add persistent flag of firstRun = false
						app.quit();
					}
				});
				// throw err;
			}
			console.log('MAIN createSetup successfully completed. Starting menubar...');
			// let mainWindow = createMenubar();
		});
	} else {
		// start menubar
		// console.log('Normal run. Creating MasterPass prompt...');
		console.log('Normal run. Creating Menubar...');
		// TODO: Implement masterPassPrompt function
		global.mdb = new Db(global.paths.mdb);
		global.mdb.get('accounts', function (err, accounts) {
			if (err) {
				if (err.notFound) {
					console.log(`ERROR: accounts NOT FOUND, declaring global.accounts = {}...`);
					global.accounts = {};
					return;
				}
				// I/O or other error, pass it up the callback
				console.log(`ERROR: mdb.get('accounts') failed, ${err}`);
				return;
			}
			console.log(`SUCCESS: accounts FOUND, ${accounts}...\n, doing JSON.parse to accounts`);
			global.accounts = JSON.parse(accounts);
			global.accounts[Object.keys(global.accounts)[0]].changed = false;
			return;
		});
		global.mdb.get('userConfig', function (err, userConfig) {
			if (err) {
				if (err.notFound) {
					console.log(`ERROR: userConfig NOT FOUND, ...`);
					return;
				}
				// I/O or other error, pass it up the callback
				console.log(`ERROR: mdb.get('userConfig') failed, ${err}`);
				return;
			}
			console.log(`SUCCESS: userConfig FOUND, ${userConfig}\n, doing JSON.parse & setting to global.settings.user`);
			global.settings.user = JSON.parse(userConfig);
			return;
		});
		Cryptobar(function (result) {
			// body...
		});
		// if (!global.MasterPass.get()) {
		// 	masterPassPrompt(null, function(err) {
		// 		if (err) {
		// 			console.log(`ERROR: ${err}`);
		// 		}
		// 	});
		// }
		// global.mdb = new Db(global.paths.mdb);
		// global.vault = new Db(global.paths.vault);
	}
});
