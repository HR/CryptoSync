'use strict';
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;
const Tray = electron.Tray;
const OAuth = require('./src/OAuth');
const fs = require('fs-plus');
const Db = require('./src/Db');
const shell = require('electron').shell;
const Positioner = require('electron-positioner');
//	TODO: consider using 'q' or 'bluebird' promise libs later
// TODO: consider using arrow callback style I.E. () => {}

// MasterPass is protected (private var) and only exist in Main memory
global.MasterPass = require('./src/MasterPass');
global.gAuth = null;
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
	user: {},
	default: { // TODO: finalise the default settings
		crypto: {

		},
		sync: {

		}
	}
};

global.views = {
	main: `file://${__dirname}/static/index.html`,
	masterpassprompt: `file://${__dirname}/static/masterpassprompt.html`,
	setup: `file://${__dirname}/static/setup.html`,
	menubar: `file://${__dirname}/static/menubar.html`,
	errorprompt: `file://${__dirname}/static/errorprompt.html`,
	settings: `file://${__dirname}/static/settings.html`
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
	let win = new BrowserWindow({
		width: 500, // 290
		height: 315,
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
		console.log('MAIN: openSyncFolder event emitted');
		shell.showItemInFolder(global.paths.vault);
	});

	ipc.on('openAccounts', function (event) {
		console.log('MAIN: openAccounts event emitted');
		createSettings(function(result){

		});
	});

	ipc.on('openSettings', function (event) {
		console.log('MAIN: openSettings event emitted');
		shell.showItemInFolder(global.paths.vault);
	});

	ipc.on('openVault', function (event) {
		console.log('MAIN: openVault event emitted');
		shell.showItemInFolder(global.paths.vault);
	});

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

	win.on('closed', function () {
		console.log('win.closed event emitted for Menubar.');
		win = null;
		callback();
	});
}

function createSettings(){
	const win = new BrowserWindow({
		width: 800,
		height: 600,
		center: true
	});
	win.loadURL(global.views.settings);
	win.openDevTools();
	win.on('closed', function () {
		console.log('win.closed event emitted for createSettings.');
		win = null;
		callback();
	});
}

function createMasterPassPrompt() {
	// var BrowserWindow = electron.remote.BrowserWindow;
	// BrowserWindow.addDevToolsExtension('../devTools/react-devtools/shells/chrome');
	const win = new BrowserWindow({
		width: 800, //600
		height: 600,
		center: true
			// width: 400,
			// height: 460
			// resizable: false,
	});
	win.loadURL(global.views.masterpassprompt);
	win.openDevTools();
	ipc.on('masterpass-submission', function (event, masterpass, intype) {
		if (intype === 'default') {
			global.MasterPass.set(masterpass);
			console.log(`Decrypting DB using masspass... using masterpass: ${masterpass}`);
			// Db.decrypt(global.paths.vault, masspass, function(succ, err) {
			//	 // body...
			// });
		}
	});

	win.on('closed', onClosed);

	return win;
}

function createSetup(callback) {
	// var BrowserWindow = require('electron').remote.BrowserWindow;
	// BrowserWindow.addDevToolsExtension('../devTools/react-devtools/shells/chrome');
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
		console.log('initAuth emitted. Creating gAuth...');
		// if (type === 'gdrive') {
		global.gAuth = new OAuth(type, global.paths.gdriveSecret);
		global.gAuth.authorize(global.mdb, function (authUrl) {
			if (authUrl) {
				console.log(`Loading authUrl... ${authUrl}`);
				win.loadURL(authUrl, {
					'extraHeaders': 'pragma: no-cache\n'
				});
			} else {
				console.log('As already exists, loading home...');
				win.loadURL(`${global.views.setup}?nav_to=masterpass`);
			}
		});
		// }
	});

	win.on('unresponsive', function (event) {
		console.log('createSetup UNRESPONSIVE');
	});

	webContents.on('will-navigate', function (event, url) {
		console.log(`IPCMAIN will-navigate emitted,\n URL: ${url}`);
		const regex = /http:\/\/localhost/g;
		if (regex.test(url)) {
			// win.loadURL(global.views.setup);
			event.preventDefault();
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			console.log('MAIN: url matched, sending to RENDER...');
			webContents.on('did-finish-load', function () {
				webContents.send('auth-result', url);
			});
		}
	});

	ipc.on('initSetMasterPass', function (event, masterpass) {
		console.log('Setting Masterpass...');
		global.MasterPass.set(masterpass);
		win.loadURL(`${global.views.setup}?nav_to=done`);
		// Db.decrypt(global.paths.vault, masspass, function(succ, err) {
		// 	// body...
		// });
	});

	ipc.on('done', function (event, masterpass) {
		console.log('Setup completed. Closing this window and opening menubar...');
		setupComplete = true;
		win.close();
	});

	win.on('closed', function () {
		console.log('win.closed event emitted for setupWindow.');
		global.mdb.close();
		win = null;
		if (setupComplete) {
			callback(null);
		} else {
			callback('Setup did not finish successfully');
		}
	});
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

function Setup() {
	// Guide user through setting up a MasterPass and connecting to cloud services
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

// Check for connection status
ipc.on('online-status-changed', function (event, status) {
	console.log(status);
});

app.on('window-all-closed', () => {
	console.log('window-all-closed event emitted');
	if (process.platform !== 'darwin') {
		// TODO: Cease any db OPs; encrypt vault before quitting the app and dump to fs
		console.log('Calling db.close()');
		global.vault.close();
		global.mdb.close();
		app.quit();
	}
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
		createSetup(function (err) {
			if (err) {
				console.log(err);
				createErrorPrompt(err, function (response) {
					console.log(`ERRPROMT response: ${response}`);
					if (response === 'retry') {
						// TODO: new createSetup
						createSetup(null);
					} else {
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
		Cryptobar(function (result) {
			// body...
		});
		// if (!global.MasterPass.get()) {
		// 	masterPassPrompt(function(masterpass) {
		// 		global.MasterPass.set(masterpass);
		// 	});
		// }
		// global.mdb = new Db(global.paths.mdb);
		// global.vault = new Db(global.paths.vault);
	}
});
