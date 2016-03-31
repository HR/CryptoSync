'use strict';
const electron = require('electron');
const app = electron.app,
	BrowserWindow = electron.BrowserWindow,
	ipc = electron.ipcMain,
	Tray = electron.Tray,
	shell = electron.shell,
	Db = require('./src/Db'),
	crypto = require('./src/crypto'),
	OAuth = require('./src/OAuth'),
	util = require('./src/util'),
	res = require('./static/js/res'),
	Account = require('./src/Account'),
	MasterPass = require('./src/MasterPass'),
	sync = require('./src/sync'),
	fs = require('fs-extra'),
	chokidar = require('chokidar'),
	https = require('https'),
	sutil = require('util'),
	moment = require('moment'),
	base64 = require('base64-stream'),
	Positioner = require('electron-positioner'),
	_ = require('lodash'),
	google = require('googleapis'),
	async = require('async');

const API_REQ_LIMIT = 8;
// TODO: USE ES6 Generators for asynchronously getting files, encryption and then uploading them
// TODO: consider using 'q' or 'bluebird' promise libs later
// TODO: consider using arrow callback style I.E. () => {}
// YOLO#101

// MasterPass is protected (private var) and only exist in Main memory
global.MasterPassKey = require('./src/_MasterPassKey');
// TODO: CHANGE USAGE OF gAuth SUPPORT MULTIPLE ACCOUNTS
global.gAuth;
global.accounts = {};
global.creds = {};
global.state = {};
global.files = {};

/* Global state
 has three queues:
 - toGet: files to download (incl. updated ones)
 - toCrypt: files to encrypt
 - toUpdate: files to upload (/update)
*/
// app.setPath('cs', `${app.getPath('home')}/CryptoSync`);

global.stats = {};
global.paths = {
	home: `${app.getPath('home')}/CryptoSync`,
	crypted: `${app.getPath('home')}/CryptoSync/.encrypted`,
	mdb: `${app.getPath('userData')}/mdb`,
	userData: app.getPath('userData'),
	vault: `${app.getPath('home')}/CryptoSync/vault.crypto`,
	gdriveSecret: `${app.getPath('userData')}/client_secret_gdrive.json`
		// dropboxSecret: `${app.getPath('userData')}/client_secret_dropbox.json`
};

// TODO: Get from mdb as JSON and store as JSON as one value
// TODO: set default at setup only
global.settings = {
	user: {

	},
	default: { // TODO: finalise the default settings
		keyLength: "128",
		algorithm: "CTR",
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

// Override default main process console.log to include time stamp and file being exec
(function () {
	'use strict';
	if (console.log) {
		let old = console.log;
		console.log = function () {
			Array.prototype.unshift.call(arguments, `[${moment().format('DD/MM HH:MM:SS')}]`);
			/* use process.argv[1]? */
			old.apply(this, arguments);
		};
	}
})();

// prevent the following from being garbage collected
let Menubar;
let drive;
let exit = false;

/**
 * Promises (global)
 **/

let InitDrive = function (gAuth) {
	// store auth token in mdb
	return new Promise(function (resolve, reject) {
		global.drive = google.drive({
			version: 'v3',
			auth: gAuth.oauth2Client
		});
		resolve();
	});
};

/**
 * Window constructors
 **/

// Menubar window
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
		webContents.send('updateMoments');
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
	// TODO: Change icon based on mode (dark || light) on OSX and set default to light
	Menubar = new Tray('static/images/mb/trayic_light.png');
	Menubar.on('click', click)
		.on('double-click', click);

	win.on('blur', hideWindow);
	win.loadURL(global.views.menubar);
	win.openDevTools();
	const webContents = win.webContents;

	// Event listeners
	sync.event.on('put', (file) => {
		console.log(`PUT EVENT RECEIVED for ${file.name}`);
		webContents.send('synced', {
			name: file.name,
			fileType: file.fullFileExtension,
			type: 'gdrive',
			lastSynced: file.lastSynced
		});
	});

	sync.event.on('statusChange', (status) => {
		console.log(`statusChange: status changed to ${status}`);
		webContents.send('statusChange', status);
	});

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
		Settings(function (result) {

		});
	});

	ipc.on('openVault', function (event) {
		console.log('IPCMAIN: openVault event emitted');
		Vault(null);
	});

	win.on('closed', function () {
		console.log('win.closed event emitted for Menubar.');
		win = null;
		callback();
	});
}

function Vault(callback) {
	let win = new BrowserWindow({
		width: 800,
		height: 400,
		center: true,
		titleBarStyle: 'hidden-inset'
	});
	win.loadURL(global.views.vault);
	win.openDevTools();
	win.on('closed', function () {
		console.log('win.closed event emitted for Vault.');
		win = null;
		if (callback) callback();
	});
}

function Setup(callback) {
	let win = new BrowserWindow({
		width: 640,
		height: 420,
		center: true,
		show: true,
		titleBarStyle: 'hidden-inset'
			// width: 580,
			// height: 420
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
		console.log('Setup UNRESPONSIVE');
	});

	webContents.on('did-navigate', function (event, url) {
		console.log(`IPCMAIN: did-navigate emitted,\n URL: ${url}`);
		const regex = /^http:\/\/localhost/g;
		if (regex.test(url)) {
			console.log("localhost URL matches");
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			// console.log('MAIN: url matched, sending to RENDER...');
			let err = util.getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				let auth_code = util.getParam("code", url);
				console.log(`IPCMAIN: Got the auth_code, ${auth_code}`);
				console.log("IPCMAIN: Calling callback with the code...");

				// Send code to call back and redirect
				let storeToken = function (token) {
					// store auth token in mdb
					return new Promise(function (resolve, reject) {
						gAuth.storeToken(token, mdb);
						console.log(`IPCMAIN: token retrieved and stored: ${token}`);
						console.log(`IPCMAIN: oauth2Client retrieved: ${gAuth.oauth2Client}`);
						resolve(gAuth);
					});
				};

				let initSyncGlobals = function (trees) {
					return new Promise(function (resolve, reject) {
						console.log(`\n THEN saving file tree (fBtree) to global.state.toGet`);
						let files = _.flattenDeep(trees[0]);
						global.state = {};
						global.state.toGet = files;
						global.state.toCrypt = [];
						global.state.toUpdate = [];
						global.state.rfs = trees[1];
					});
				};

				// Get auth token from auth code
				gAuth.getToken(auth_code)
					.then(storeToken)
					.then(InitDrive)
					.then(sync.getAccountInfo)
					.then(sync.getPhoto)
					.then(sync.setAccountInfo)
					.then(sync.getAllFiles)
					.then(initSyncGlobals)
					.catch(function (error) {
						console.error(`PROMISE ERR: ${error.stack}`);
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
	webContents.on('will-navigate', function (event, url) {
		console.log(`IPCMAIN: will-navigate emitted,\n URL: ${url}`);
	});

	ipc.on('setMasterPass', function (event, masterpass) {
		console.log('IPCMAIN: setMasterPass emitted, Setting Masterpass...');
		MasterPass.set(masterpass, function (err, mpkey) {
			global.MasterPassKey.set(mpkey);
			webContents.send('setMasterPassResult', err);
		});
	});

	ipc.on('done', function (event, masterpass) {
		console.log('IPCMAIN: done emitted, setup complete. Closing this window and opening menubar...');
		setupComplete = true;
		initVault(function (err) {
			if (err) {
				console.error(`initVault ERR: ${err.stack}`);
			} else {
				win.close();
			}
		});
		// TODO: restart the application in default mode
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

function initVault(callback) {
	console.log(`initVault invoked. Creating global vault obj & encrypting...`);
	global.vault = {};
	global.vault.creationDate = moment().format();
	// TODO: decide whether to use crypto.encryptObj or genIvSalt (and then encryptObj
	// & remove gen functionality from crypto.encryptObj)
	crypto.genIv(function (err, iv, salt) {
		console.log(`crypto.genIvSalt callback.`);
		if (err) {
			callback(err);
		} else {
			global.creds.viv = iv;
			console.log(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`);
			crypto.encryptObj(global.vault, global.paths.vault, global.MasterPassKey.get(), global.creds.viv, function (err, tag) {
				console.log(`crypto.encryptObj callback.`);
				if (err) {
					callback(err);
				} else {
					console.log(`Encrypted successfully with tag = ${tag.toString('hex')}`);
					global.creds.authTag = tag;
					callback(null);
				}
			});
		}
	});
}

function addAccountPrompt(callback) {
	let win = new BrowserWindow({
		width: 580,
		height: 420,
		center: true,
		show: true,
		titleBarStyle: 'hidden-inset'
			// width: 400,
			// height: 460
			// resizable: false,
	});
	let webContents = win.webContents;
	win.loadURL(global.views.setup);
	win.openDevTools();
	ipc.on('initAuth', function (event, type) {
		console.log('IPCMAIN: initAuth emitted. Creating Auth...');
		// if (type === 'gdrive') {
		global.gAuth = new OAuth(type, global.paths.gdriveSecret);
		// TODO: rewrite the authorize function
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
		console.log('addAccountPrompt UNRESPONSIVE');
	});

	webContents.on('did-navigate', function (event, url) {
		console.log(`IPCMAIN: did-navigate emitted,\n URL: ${url}`);
		const regex = /^http:\/\/localhost/g;
		if (regex.test(url)) {
			console.log("localhost URL matches");
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			// console.log('MAIN: url matched, sending to RENDER...');
			let err = util.getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				let auth_code = util.getParam("code", url);
				console.log(`IPCMAIN: Got the auth_code, ${auth_code}`);
				console.log("IPCMAIN: Calling callback with the code...");

				// Send code to call back and redirect

				// Get auth token from auth code
				/*
				 * TODO: ADD FINAL ACCOUNTS CODE
				 */

			} else {
				// TODO: close window and display error in settings
				callback(err);
			}
		}
	});
	webContents.on('will-navigate', function (event, url) {
		console.log(`IPCMAIN: will-navigate emitted,\n URL: ${url}`);
	});

	win.on('closed', function () {
		console.log('IPCMAIN: win.closed event emitted for setupWindow.');
		win = null;
		callback('ERROR: Cancelled the account adding flow');
	});
}


function Settings(callback) {
	let win = new BrowserWindow({
		width: 800,
		height: 600,
		center: true
	});
	win.loadURL(global.views.settings);
	win.openDevTools();
	ipc.on('resetMasterPass', function (event, type) {
		console.log('IPCMAIN: resetMasterPass emitted. Creating MasterPassPrompt...');
		MasterPassPrompt(true, function (newMPset) {
			// if (newMPset) then new new MP was set otherwise it wasn't
			// TODO: show password was set successfully
			console.log(`MAIN: MasterPassPrompt, newMPset finished? ${newMPset}`);
			return;
		});
	});
	ipc.on('removeAccount', function (event, account) {
		console.log(`IPCMAIN: removeAccount emitted. Creating removing ${account}...`);
		// TODO: IMPLEMENT ACCOUNT REMOVAL ROUTINE
		if (_.unset(global.accounts, account)) {
			// deleted
			// reload window to update
			win.loadURL(global.views.settings);
			// TODO: update SYNC Objs
			// TODO: decide whether to do setup is all accounts removed
			// if (Object.keys(global.accounts).length === 0) {
			// 	// Create Setup
			//
			// } else {
			//
			// }
		} else {
			// not deleted
		}
	});
	win.on('closed', function () {
		console.log('win.closed event emitted for Settings.');
		win = null;
		callback();
	});
}

function MasterPassPrompt(reset, callback) {
	let tries = 0,
		newMPset = false,
		gotMP = false;
	let win = new BrowserWindow({
		width: 300, // 300
		height: 435,
		center: true,
		titleBarStyle: 'hidden-inset'
			// resizable: false,
	});
	let webContents = win.webContents;
	if (reset) {
		win.loadURL(`${global.views.masterpassprompt}?nav_to=reset`);
	} else {
		win.loadURL(global.views.masterpassprompt);
	}
	// win.openDevTools();
	ipc.on('checkMasterPass', function (event, masterpass) {
		console.log('IPCMAIN: checkMasterPass emitted. Checking MasterPass...');
		// TODO: Clean this up and remove redundancies
		MasterPass.check(masterpass, function (err, match, mpkey) {
			if (err) {
				//send error
				webContents.send('checkMasterPassResult', err);
				callback(err);
			}
			if (match) {
				console.log("IPCMAIN: PASSWORD MATCHES!");
				// Now derive masterpasskey and set it (temporarily)
				global.MasterPassKey.set(mpkey);
				webContents.send('checkMasterPassResult', {
					err: null,
					match: match
				});
				// TODO: Open Vault and start Menubar
				// callback();
				// Db.decrypt(global.paths.vault, masspass, function(succ, err) {
				// 	// body...
				// });
				gotMP = true;
				setTimeout(function () {
					win.close();
				}, 1000);
			} else {
				console.log("IPCMAIN: PASSWORD DOES NOT MATCH!");
				webContents.send('checkMasterPassResult', {
					err: null,
					match: match
				});
				if (tries >= 3) {
					app.quit();
				}
				tries++;
			}
		});
	});
	ipc.on('setMasterPass', function (event, masterpass) {
		console.log('IPCMAIN: setMasterPass emitted, Setting Masterpass...');
		MasterPass.set(masterpass, function (err, mpkey) {
			// TODO: create new Vault, delete old data and start re-encrypting
			if (!err) {
				newMPset = true;
				global.MasterPassKey.set(mpkey);
				webContents.send('setMasterPassResult', null);
			} else {
				webContents.send('setMasterPassResult', err);
			}
		});
	});
	win.on('closed', function () {
		console.log('win.closed event emitted for Settings.');
		win = null;
		// callback(((reset) ? newMPset : null));
		if (gotMP) {
			callback();
		} else {
			app.quit();
		}
	});

	return win;
}

// TODO: replace with dialog.showErrorBox(title, content) for native dialog?
function ErrorPrompt(err, callback) {
	let win = new BrowserWindow({
		width: 240,
		height: 120,
		center: true,
		titleBarStyle: 'hidden-inset',
		show: true
	});
	let webContents = win.webContents;
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

// function Setup() {
// 	// Guide user through setting up a MPhash and connecting to cloud services
// 	// TODO: transform into Async using a Promise
// 	return new Promise(function (resolve, reject) {
// 		fs.makeTreeSync(global.paths.home);
// 		fs.makeTreeSync(global.paths.mdb);
// 		resolve();
// 	});
// }

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
app.on('will-quit', (event) => {
	if (!exit) {
		event.preventDefault();
		console.log(`APP.ON('will-quit'): will-quit event emitted`);
		console.log(`platform is ${process.platform}`);
		// TODO: Cease any db OPs; encrypt vault before quitting the app and dump to fs
		// global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client.credentials = global.gAuth.credentials;
		global.stats.endTime = moment().format();

		Promise.all([
			util.saveGlobalObj('accounts'),
			util.saveGlobalObj('state'),
			util.saveGlobalObj('settings'),
			util.saveGlobalObj('files'),
			util.saveGlobalObj('stats')
		]).then(function () {
			if (global.MasterPassKey.get() && !_.isEmpty(global.vault)) {
				console.log(`DEFAULT EXIT. global.MasterPassKey and global.vault not empty. Calling crypto.encryptObj...`);
				console.log(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`);
				crypto.encryptObj(global.vault, global.paths.vault, global.MasterPassKey.get(), global.creds.viv, function (err, tag) {
					console.log(`crypto.encryptObj invoked...`);
					if (err) {
						console.error(err.stack);
					} else {
						console.log(`Encrypted successfully with tag = ${tag.toString('hex')}, saving auth tag and closing mdb...`);
						global.creds.authTag = tag;
						util.saveGlobalObj('creds').then(() => {
							global.mdb.close();
							console.log('Closed vault and mdb (called mdb.close()).');
							exit = true;
							app.quit();
						}).catch((err) => {
							console.error(`Error while saving global.creds before quit: ${err.stack}`);
						});
					}
				});
			} else {
				console.log(`NORMAL EXIT. global.MasterPassKey / global.vault empty. Just closing mdb (global.mdb.close())...`);
				global.mdb.close();
				exit = true;
				app.quit();
			}
		}, function (reason) {
			console.log(`PROMISE ERR (reason): `, reason);
		}).catch(function (error) {
			console.error(`PROMISE ERR: ${error.stack}`);
		});
	} else {
		return;
	}
});

app.on('activate', function (win) {
	console.log('activate event emitted');
	// 	if (!win) {
	// 		win = createMainWindow();
	// 	}
});

app.on('ready', function () {
	// TODO: Wrap all this into init();
	let setupRun = ((!util.checkDirectorySync(global.paths.mdb)) || (!util.checkFileSync(global.paths.vault)));
	if (setupRun) {
		// TODO: Do more extensive FIRST RUN check
		console.log('First run. Creating Setup wizard...');
		// Setup();
		let Init = function () {
			console.log(`INITIALISATION PROMISE`);
			return new Promise(function (resolve, reject) {
				global.mdb = new Db(global.paths.mdb);
				fs.ensureDir(global.paths.home, function (err) {
					if (err) reject(err);
					resolve();
				});
			});
		};
		// TODO: Wrap Setup around Setup and call Setup the way its being called now
		// Run User through Setup/First Install UI
		Init()
			// .then(
			// 	global.mdb.del('gdrive-token', function (err) {
			// 		if (err) console.log(`Error retrieving gdrive-token, ${err}`);
			// 		console.log("deleted gdrive-token");
			// 	})
			// )
			.then(
				Setup(function (err) {
					if (err) {
						console.log(err);
						ErrorPrompt(err, function (response) {
							console.log(`ERRPROMT response: ${response}`);
							if (response === 'retry') {
								// TODO: new Setup
								Setup(null);
							} else {
								// TODO: add persistent flag of firstRun = false
								app.quit();
							}
						});
						// throw err;
					}
					console.log('MAIN Setup successfully completed. Starting menubar...');
					// Cryptobar(function (result) {
					//
					// });
					app.quit();
				})
			)
			.catch(function (error) {
				console.error(`PROMISE ERR: ${error.stack}`);
			});
	} else {
		// start menubar
		console.log('Normal run. Creating Menubar...');
		// TODO: Implement MasterPassPrompt function

		/* TODO: Implement all objects to restore from persistent storage as a routine to be run on start
		 * TODO: Consider whether to use Obj.change flag on accounts (potentially other Objs) to protect from accidental changes and corruption (by sys)?
		 */
		let Init = function () {
			// Decrypt db (the Vault) and get ready for use
			// open mdb
			return new Promise(function (resolve, reject) {
				global.mdb = new Db(global.paths.mdb);
				global.mdb.get('creds', function (err, json) {
					if (err) {
						if (err.notFound) {
							console.log(`ERROR: key creds NOT FOUND `);
							global.creds = {};
							reject(err);
						} else {
							// I/O or other error, pass it up the callback
							console.log(`ERROR: mdb.get('creds') FAILED`);
							reject(err);
						}
					} else {
						console.log(`SUCCESS: creds FOUND ${json.substr(0, 20)}`);
						global.creds = JSON.parse(json);
						setTimeout(function () {
							console.log(`resolve global.creds called`);
							resolve();
						}, 0);
					}
				});
				fs.ensureDir(global.paths.home, function (err) {
					if (err) reject(err);
					resolve();
				});
			});
		};

		Init()
			.catch(function (error) {
				console.error(`PROMISE ERR: ${error.stack}`);
			});
		// TODO: rewrite as promise
		MasterPassPrompt(null, function (err) {
			if (err) {
				throw err;
			} else {
				global.vault = {};
				crypto.decryptObj(global.paths.vault, global.MasterPassKey.get(), global.creds.viv, global.creds.authTag, function (err, vault) {
					if (err) {
						console.error(`decryptObj ERR: ${err.stack}`);
					} else {
						global.vault = vault;
						console.log(`Decrypted vault, vault's content is ${sutil.inspect(vault).substr(0, 20)}`);
						Promise.all([
								util.restoreGlobalObj('accounts'),
								util.restoreGlobalObj('state'),
								util.restoreGlobalObj('settings'),
								util.restoreGlobalObj('stats'),
								util.restoreGlobalObj('files')
							])
							.then(() => {
								const o2c = global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client;
								global.gAuth = new google.auth.OAuth2(o2c.clientId_, o2c.clientSecret_, o2c.redirectUri_);
								gAuth.setCredentials(o2c.credentials);
								global.drive = google.drive({
									version: 'v3',
									auth: gAuth
								});
								return;
							})
							.then(() => {
								// Set initial stats
								global.stats.startTime = moment().format();
								global.stats.time = moment();
								return;
							})
							.then(
								// TODO: start sync daemon
								// Start menubar
								Cryptobar(function (result) {
									// body...
								})
							).then(() => {

								let pushGetQueue = function (file) {
									console.log(`PROMISE: pushGetQueue for ${file.name}`);
									return new Promise(function (resolve, reject) {
										sync.getQueue.push(file, function (err, file) {
											if (err) {
												console.error(`ERROR occurred while GETting ${file.name}`);
												reject(err);
											}
											// update file globally
											global.files[file.id] = file;
											// global.state.toCrypt.push(file); // add from toCrypt queue
											// _.pull(global.state.toGet, file); // remove from toGet queue
											console.log(`DONE GETting ${file.name}`);
											resolve(file);
										});
									});
								};

								let pushCryptQueue = function (file) {
									console.log(`PROMISE: pushCryptQueue for ${file.name}`);
									return new Promise(function (resolve, reject) {
										sync.cryptQueue.push(file, function (err, file) {
											if (err) {
												console.error(`ERROR occurred while ENCRYPTting`);
												reject(err);
											}
											// update file globally
											global.files[file.id] = file;
											// global.state.toUpdate.push(file);
											// _.pull(global.state.toCrypt, file);
											console.log(`DONE ENCRYPTting ${file.name}`);
											resolve(file);
										});
									});
								};

								let pushUpdateQueue = function (file) {
									console.log(`PROMISE: pushUpdateQueue for ${file.name}`);
									return new Promise(function (resolve, reject) {
										sync.updateQueue.push(file, function (err, file) {
											if (err) {
												console.error(`ERROR occurred while UPDATting`);
												reject();
											}
											// update file globally
											global.files[file.id] = file;
											// remove file from persistent update queue
											_.pull(global.state.toUpdate, file);
											sync.event.emit('put', file);
											console.log(`DONE UPDATting ${file.name}. Removing from global status...`);
											resolve();
										});
									});
								};

								sync.getQueue.drain = function () {
									console.log('DONE getQueue for ALL items');
									// start encyrpting
								};

								sync.cryptQueue.drain = function () {
									console.log('DONE cryptQueue for ALL items');
									// start putting
								};

								sync.updateQueue.drain = function () {
									console.log('DONE updateQueue for ALL items');
									// start taking off toUpdate
								};

								// Restore queues on startup
								if (!_.isEmpty(global.state.toGet)) {
									sync.event.emit('statusChange', 'getting');
									global.state.toGet.forEach(function (file) {
										pushGetQueue(file)
											// .then(pushCryptQueue)
											// .then(pushUpdateQueue)
											.then(() => {
												sync.event.emit('statusChange', 'synced');
											})
											.catch((err) => {
												sync.event.emit('statusChange', 'notsynced');
												console.error(`PROMISE ERR: ${err.stack}`);
											});
									});
								}

								if (!_.isEmpty(global.state.toCrypt)) {
									sync.event.emit('statusChange', 'encrypting');
									global.state.toCrypt.forEach(function (file) {
										pushCryptQueue(file)
											.then(pushUpdateQueue)
											.then(() => {
												sync.event.emit('statusChange', 'synced');
											})
											.catch((err) => {
												sync.event.emit('statusChange', 'notsynced');
												console.error(`PROMISE ERR: ${err.stack}`);
											});
									});
								}

								if (!_.isEmpty(global.state.toUpdate)) {
									sync.event.emit('statusChange', 'putting');
									global.state.toUpdate.forEach(function (file) {
										pushUpdateQueue(file)
											.then(() => {
												sync.event.emit('statusChange', 'synced');
											})
											.catch((err) => {
												sync.event.emit('statusChange', 'notsynced');
												console.error(`PROMISE ERR: ${err.stack}`);
											});
									});
								}
								// TODO: Modularise, write as a seperate script
								// (with check for changes at interval)
								// and spawn as child process (with shared memory)
								// Implement with ES6 Generators?

								const dotRegex = /\/\..+/g;
								const fNameRegex = /[^/]+[A-z0-9]+\.[A-z0-9]+/g;

								const watcher = chokidar.watch(global.paths.home, {
									ignored: dotRegex,
									persistent: true,
									ignoreInitial: true,
									alwaysStat: true
								});

								let createFileObj = function (fileId, fileName) {
									return new Promise(function (resolve, reject) {
										let file = {};
										file.name = fileName;
										file.id = fileId;
										file.mtime = stats.mtime;
										global.files[file.id] = file;
										resolve(file);
									});
								};

								watcher.on('add', (path, stats) => {
									if (dotRegex.test(path)) {
										// Ignore dot file
										console.log(`IGNORE added file ${path}, stats.mtime = ${stats.mtime}`);
										watcher.unwatch(path);
									} else {
										// Queue up to encrypt and put
										let fileName = path.match(fNameRegex)[0];
										let relPath = path.replace(global.paths.home, '');
										console.log(`ADD added file ${fileName}, stats ${stats.mtime}`);

										sync.genID()
											.then((fileId) => {
												let file = {};
												file.name = fileName;
												file.id = fileId;
												file.origpath = path;
												file.mtime = stats.mtime;
												global.files[file.id] = file;
												return file;
											})
											.then(pushCryptQueue)
											.then((file) => {
												console.log(`Done encrypting ${file.name} (${file.id})`);
											})
											.catch((err) => {
												console.error(`Error occured while adding ${fileName}:\n${err.stack}`);
											});
									}
								});

								watcher
									.on('change', (path, stats) => {
										if (dotRegex.test(path)) {
											// Ignore dot file
											console.log(`IGNORE added file ${path}, stats ${stats.mtime}`);
											watcher.unwatch(path);
										} else {
											// Queue up to encrypt and put
											let fileName = path.match(fNameRegex)[0];
											console.log(`File ${fileName} at ${path} has been changed, stats ${stats.mtime}}`);
										}
									})
									.on('unlink', (path, stats) => console.log(`File ${path} has been removed, stats ${stats}`))
									.on('addDir', (path, stats) => console.log(`Directory ${path} has been added, stats ${stats}`))
									.on('unlinkDir', (path, stats) => console.log(`Directory ${path} has been removed, stats ${stats}`))
									.on('error', error => console.log(`Watcher error: ${error}`))
									.on('ready', () => {
										console.log('Initial scan complete. Ready for changes');
									});
								// .on('raw', (event, path, details) => {
								// 	console.log('Raw event info:', event, path, details);
								// });
								//
								// Spawn a child process for sync worker
								// const cp = require('child_process');
								// const child = cp.fork('./src/sync_worker');
								//
								// child.on('put', function (file) {
								// 	// Receive results from child process
								// 	console.log('received: ' + file);
								// });
								//
								// // Send child process some work
								// child.send('Please up-case this string');
							})
							.catch(function (error) {
								console.error(`PROMISE ERR: ${error.stack}`);
							});

					}
				});
			}
		});
	}
});
