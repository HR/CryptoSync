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
	Vault = require('./src/Vault'),
	MasterPass = require('./src/MasterPass'),
	sync = require('./src/sync'),
	init = require('./src/init'),
	synker = require('./src/synker'),
	fs = require('fs-extra'),
	chokidar = require('chokidar'),
	https = require('https'),
	sutil = require('util'),
	moment = require('moment'),
	// Vault_cl = require('./src/Vault_cl'),
	base64 = require('base64-stream'),
	Positioner = require('electron-positioner'),
	_ = require('lodash'),
	google = require('googleapis'),
	async = require('async'),
	logger = require('./logger');

require('dotenv').config();

// App init
app.dock.setIcon('res/app-icons/CryptoSync256.png');

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

const API_REQ_LIMIT = 8;
// TODO: USE ES6 Generators for asynchronously getting files, encryption and then uploading them
// TODO: consider using 'q' or 'bluebird' promise libs later
// TODO: consider using arrow callback style I.E. () => {}
// YOLO#101

// MasterPassKey is protected (private var) and only exist in Main memory
// MasterPassKey is a derived key of the actual user MasterPass
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
	vault: `${app.getPath('home')}/CryptoSync/vault.crypto`
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


// prevent the following from being garbage collected
let Menubar;
let drive;
let exit = false;

/**
 * Promises (global)
 **/

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
		logger.verbose(`PUT EVENT RECEIVED for ${file.name}`);
		webContents.send('synced', {
			name: file.name,
			fileType: file.fullFileExtension,
			type: 'gdrive',
			lastSynced: file.lastSynced
		});
	});

	sync.event.on('statusChange', (status) => {
		logger.verbose(`statusChange: status changed to ${status}`);
		webContents.send('statusChange', status);
	});

	ipc.on('openSyncFolder', function (event) {
		logger.verbose('IPCMAIN: openSyncFolder event emitted');
		shell.showItemInFolder(global.paths.vault);
	});

	ipc.on('quitApp', function (event) {
		logger.verbose('IPCMAIN: quitApp event emitted, Calling app.quit()...');
		app.quit();
	});

	ipc.on('openSettings', function (event) {
		logger.verbose('IPCMAIN: openSettings event emitted');
		Settings(function (result) {

		});
	});

	ipc.on('openVault', function (event) {
		logger.verbose('IPCMAIN: openVault event emitted');
		VaultUI(null);
	});

	win.on('closed', function () {
		logger.verbose('win.closed event emitted for Menubar.');
		win = null;
		callback();
	});
}

function VaultUI(callback) {
	let win = new BrowserWindow({
		width: 800,
		height: 400,
		center: true,
		titleBarStyle: 'hidden-inset'
	});
	win.loadURL(global.views.vault);
	win.openDevTools();
	win.on('closed', function () {
		logger.verbose('win.closed event emitted for VaultUI.');
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
		logger.verbose('IPCMAIN: initAuth emitted. Creating Auth...');
		global.gAuth = new OAuth(type);
		global.mdb.onlyGetValue('gdrive-token').then((token) => {
			global.gAuth.authorize(token, function (authUrl) {
				if (authUrl) {
					logger.info(`Loading authUrl... ${authUrl}`);
					win.loadURL(authUrl, {
						'extraHeaders': 'pragma: no-cache\n'
					});
				} else {
					logger.warn('As already exists, loading masterpass...');
					win.loadURL(`${global.views.setup}?nav_to=masterpass`);
				}
			});
		});
	});

	win.on('unresponsive', function (event) {
		logger.verbose('Setup UNRESPONSIVE');
	});

	webContents.on('did-navigate', function (event, url) {
		logger.verbose(`IPCMAIN: did-navigate emitted,\n URL: ${url}`);
		const regex = /^http:\/\/localhost\/\?(error|code)/g;
		if (regex.test(url)) {
			logger.info("localhost URL matches");
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			// logger.verbose('MAIN: url matched, sending to RENDER...');
			let err = util.getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				let auth_code = util.getParam("code", url);
				logger.verbose(`IPCMAIN: Got the auth_code, ${auth_code}`);
				logger.verbose("IPCMAIN: Calling callback with the code...");

				global.gAuth.getToken(auth_code) // Get auth token from auth code
					// store auth token in mdb
					.then((token) => {
						global.gAuth.oauth2Client.credentials = token;
						return global.mdb.storeToken(token);
					})
					.then(() => {
						return init.drive(global.gAuth);
					})
					.then(() => {
						return sync.getAccountInfo();
					})
					.then((res) => {
						return sync.getPhoto(res);
					})
					.then((param) => {
						return sync.setAccountInfo(param);
					})
					.then((email) => {
						return sync.getAllFiles(email);
					})
					.then((trees) => {
						return init.syncGlobals(trees);
					})
					.catch(function (error) {
						logger.error(`PROMISE ERR: ${error.stack}`);
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
		logger.verbose(`IPCMAIN: will-navigate emitted,\n URL: ${url}`);
	});

	ipc.on('setMasterPass', function (event, masterpass) {
		logger.verbose('IPCMAIN: setMasterPass emitted, Setting Masterpass...');
		MasterPass.set(masterpass, function (err, mpkey) {
			global.MasterPassKey.set(mpkey);
			global.mdb.saveGlobalObj('creds')
				.catch((err) => {
					throw err;
				});
			webContents.send('setMasterPassResult', err);
		});
	});

	ipc.on('done', function (event, masterpass) {
		logger.info('IPCMAIN: done emitted, setup complete. Closing this window and opening menubar...');
		setupComplete = true;
		Vault.init(global.MasterPassKey.get())
			.then(() => {
				return win.close();
			})
			.then(() => {
				return app.quit();
			})
			.catch((err) => {
				logger.error(`Vault.init ERR: ${err.stack}`);
				throw (err);
			});
		// TODO: restart the application in default mode
	});

	win.on('closed', function () {
		logger.verbose('IPCMAIN: win.closed event emitted for setupWindow.');
		win = null;
		if (setupComplete) {
			callback(null);
		} else {
			callback('Setup did not finish successfully');
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
		logger.verbose('IPCMAIN: initAuth emitted. Creating Auth...');
		global.gAuth = new OAuth(type);
		// TODO: rewrite the authorize function
		global.mdb.onlyGetValue('gdrive-token').then((token) => {
			global.gAuth.authorize(token, function (authUrl) {
				if (authUrl) {
					logger.verbose(`Loading authUrl... ${authUrl}`);
					win.loadURL(authUrl, {
						'extraHeaders': 'pragma: no-cache\n'
					});
				} else {
					logger.verbose('As already exists, loading masterpass...');
					win.loadURL(`${global.views.setup}?nav_to=masterpass`);
				}
			});
		});
	});

	win.on('unresponsive', function (event) {
		logger.verbose('addAccountPrompt UNRESPONSIVE');
	});

	webContents.on('did-navigate', function (event, url) {
		logger.verbose(`IPCMAIN: did-navigate emitted,\n URL: ${url}`);
		const regex = /^http:\/\/localhost/g;
		if (regex.test(url)) {
			logger.verbose("localhost URL matches");
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			// logger.verbose('MAIN: url matched, sending to RENDER...');
			let err = util.getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				let auth_code = util.getParam("code", url);
				logger.verbose(`IPCMAIN: Got the auth_code, ${auth_code}`);
				logger.verbose("IPCMAIN: Calling callback with the code...");

			} else {
				// TODO: close window and display error in settings
				callback(err);
			}
		}
	});
	webContents.on('will-navigate', function (event, url) {
		logger.verbose(`IPCMAIN: will-navigate emitted,\n URL: ${url}`);
	});

	win.on('closed', function () {
		logger.verbose('IPCMAIN: win.closed event emitted for setupWindow.');
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
		logger.verbose('IPCMAIN: resetMasterPass emitted. Creating MasterPassPrompt...');
		MasterPassPrompt(true, function (newMPset) {
			// if (newMPset) then new new MP was set otherwise it wasn't
			// TODO: show password was set successfully
			logger.info(`MAIN: MasterPassPrompt, newMPset finished? ${newMPset}`);
			return;
		});
	});
	ipc.on('removeAccount', function (event, account) {
		logger.verbose(`IPCMAIN: removeAccount emitted. Creating removing ${account}...`);
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
		logger.verbose('win.closed event emitted for Settings.');
		win = null;
		callback();
	});
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
	logger.info(`ERROR PROMPT: the error is ${err}`);
	webContents.on('did-finish-load', function () {
		webContents.send('error', err);
	});

	ipc.on('response', function (event, response) {
		logger.verbose('ERROR PROMPT: Got user response');
		res = response;
		win.close();
	});

	win.on('closed', function (response) {
		logger.verbose('win.closed event emitted for ErrPromptWindow.');
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


/**
 * Event handlers
 **/
// Check for connection status
ipc.on('online-status-changed', function (event, status) {
	logger.verbose(`APP: online-status-changed event emitted, changed to ${status}`);
});

app.on('window-all-closed', () => {
	logger.verbose('APP: window-all-closed event emitted');
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
app.on('quit', () => {
	logger.info('APP: quit event emitted');
});
app.on('will-quit', (event) => {
	if (!exit) {
		event.preventDefault();
		logger.info(`APP.ON('will-quit'): will-quit event emitted`);
		logger.verbose(`platform is ${process.platform}`);
		// TODO: Cease any db OPs; encrypt vault before quitting the app and dump to fs
		// global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client.credentials = global.gAuth.credentials;
		global.stats.endTime = moment().format();

		Promise.all([
			global.mdb.saveGlobalObj('accounts'),
			global.mdb.saveGlobalObj('state'),
			global.mdb.saveGlobalObj('settings'),
			global.mdb.saveGlobalObj('files'),
			global.mdb.saveGlobalObj('stats')
		]).then(function () {
			if (global.MasterPassKey.get() && !_.isEmpty(global.vault)) {
				logger.info(`DEFAULT EXIT. global.MasterPassKey and global.vault not empty. Calling crypto.encryptObj...`);
				logger.verbose(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`);
				Vault.encrypt(global.MasterPassKey.get())
					.then((tag) => {
						logger.verbose(`crypto.encryptObj invoked...`);
						logger.info(`Encrypted successfully with tag = ${tag.toString('hex')}, saving auth tag and closing mdb...`);
						global.creds.authTag = tag;
						global.mdb.saveGlobalObj('creds').then(() => {
							global.mdb.close();
							logger.info('Closed vault and mdb (called mdb.close()).');
							exit = true;
							app.quit();
						}).catch((err) => {
							logger.error(`Error while saving global.creds before quit: ${err.stack}`);
						});
					})
					.catch((err) => {
						logger.error(err.stack);
						throw err;
					});
			} else {
				logger.info(`NORMAL EXIT. global.MasterPassKey / global.vault empty. Just closing mdb (global.mdb.close())...`);
				global.mdb.close();
				exit = true;
				app.quit();
			}
		}, function (reason) {
			logger.error(`PROMISE ERR: ${reason}`);
		}).catch(function (error) {
			logger.error(`PROMISE ERR: ${error.stack}`);
		});
	} else {
		return;
	}
});

app.on('activate', function (win) {
	logger.verbose('activate event emitted');
	// 	if (!win) {
	// 		win = createMainWindow();
	// 	}
});

/**
 * Main
 **/

app.on('ready', function () {
	// TODO: Wrap all this into init();
	let setupRun = ((!util.checkDirectorySync(global.paths.mdb)) || (!util.checkFileSync(global.paths.vault)));
	if (setupRun) {
		// TODO: Do more extensive FIRST RUN check
		logger.info('First run. Creating Setup wizard...');
		// Setup();
		// TODO: Wrap Setup around Setup and call Setup the way its being called now
		// Run User through Setup/First Install UI
		init.setup()
			// .then(
			// 	global.mdb.del('gdrive-token', function (err) {
			// 		if (err) logger.error(`Error retrieving gdrive-token, ${err}`);
			// 		logger.verbose("deleted gdrive-token");
			// 	})
			// )
			.then(() => {
				return Setup(function (err) {
					if (err) {
						logger.error(err);
						ErrorPrompt(err, function (response) {
							logger.info(`ERRPROMT response: ${response}`);
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
					logger.info('MAIN Setup successfully completed. Starting menubar...');
				});

			}) // then restart app
			.catch(function (error) {
				logger.error(`PROMISE ERR: ${error.stack}`);
			});
	} else {
		// start menubar
		logger.info('Normal run. Creating Menubar...');

		/*
		 * TODO: Consider whether to use Obj.change flag on accounts (potentially other Objs) to protect from accidental changes and corruption (by sys)?
		 */

		init.main()
			.then(() => {
				return MasterPass.Prompt();
			})
			.then(() => {
				return Vault.decrypt(global.MasterPassKey.get());
			})
			.then(() => {
				return Promise.all([
					global.mdb.restoreGlobalObj('accounts'),
					global.mdb.restoreGlobalObj('state'),
					global.mdb.restoreGlobalObj('settings'),
					global.mdb.restoreGlobalObj('stats'),
					global.mdb.restoreGlobalObj('files')
				]);
			})
			.then(() => {
				return init.drive(global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client, true);
			})
			.then(() => {
				// Set initial stats
				return init.stats();
			})
			.then(() => {
				// Set initial stats
				return synker.init();
			})
			.then(() => {
				// TODO: start sync daemon
				// Start menubar
				return Cryptobar(function (result) {
					// body...
				});
			})
			// .then(() => {
			//
			// 	// TODO: Modularise, write as a seperate script
			// 	// (with check for changes at interval)
			// 	// and spawn as child process (with shared memory)
			// 	// Implement with ES6 Generators?
			//
			// 	// Spawn a child process for sync worker
			// 	// const cp = require('child_process');
			// 	// const child = cp.fork('./src/sync_worker');
			// 	//
			// 	// child.on('put', function (file) {
			// 	// 	// Receive results from child process
			// 	// 	logger.verbose('received: ' + file);
			// 	// });
			// 	//
			// 	// // Send child process some work
			// 	// child.send('Please up-case this string');
			//
			// 	const dotRegex = /\/\..+/g;
			// 	const fNameRegex = /[^/]+[A-z0-9]+\.[A-z0-9]+/g;
			//
			// 	const watcher = chokidar.watch(global.paths.home, {
			// 		ignored: dotRegex,
			// 		persistent: true,
			// 		ignoreInitial: true,
			// 		alwaysStat: true
			// 	});
			//
			// 	let createFileObj = function (fileId, fileName) {
			// 		return new Promise(function (resolve, reject) {
			// 			let file = {};
			// 			file.name = fileName;
			// 			file.id = fileId;
			// 			file.mtime = stats.mtime;
			// 			global.files[file.id] = file;
			// 			resolve(file);
			// 		});
			// 	};
			//
			// 	watcher.on('add', (path, stats) => {
			// 		if (dotRegex.test(path)) {
			// 			// Ignore dot file
			// 			logger.info(`IGNORE added file ${path}, stats.mtime = ${stats.mtime}`);
			// 			watcher.unwatch(path);
			// 		} else {
			// 			// Queue up to encrypt and put
			// 			let fileName = path.match(fNameRegex)[0];
			// 			let relPath = path.replace(global.paths.home, '');
			// 			logger.info(`ADD added file ${fileName}, stats ${stats.mtime}`);
			//
			// 			sync.genID()
			// 				.then((fileId) => {
			// 					let file = {};
			// 					file.name = fileName;
			// 					file.id = fileId;
			// 					file.origpath = path;
			// 					file.mtime = stats.mtime;
			// 					global.files[file.id] = file;
			// 					return file;
			// 				})
			// 				.then(pushCryptQueue)
			// 				.then((file) => {
			// 					logger.info(`Done encrypting ${file.name} (${file.id})`);
			// 				})
			// 				.catch((err) => {
			// 					logger.error(`Error occured while adding ${fileName}:\n${err.stack}`);
			// 				});
			// 		}
			// 	});
			//
			// 	watcher
			// 		.on('change', (path, stats) => {
			// 			if (dotRegex.test(path)) {
			// 				// Ignore dot file
			// 				logger.info(`IGNORE added file ${path}, stats ${stats.mtime}`);
			// 				watcher.unwatch(path);
			// 			} else {
			// 				// Queue up to encrypt and put
			// 				let fileName = path.match(fNameRegex)[0];
			// 				logger.info(`File ${fileName} at ${path} has been changed, stats ${stats.mtime}}`);
			// 			}
			// 		})
			// 		.on('unlink', (path, stats) => logger.info(`File ${path} has been removed, stats ${stats}`))
			// 		.on('addDir', (path, stats) => logger.info(`Directory ${path} has been added, stats ${stats}`))
			// 		.on('unlinkDir', (path, stats) => logger.info(`Directory ${path} has been removed, stats ${stats}`))
			// 		.on('error', error => logger.error(`Watcher error: ${error}`))
			// 		.on('ready', () => {
			// 			logger.info('Initial scan complete. Ready for changes');
			// 		});
			// 	// .on('raw', (event, path, details) => {
			// 	// 	logger.verbose('Raw event info:', event, path, details);
			// 	// });
			// 	//
			// })
			.catch(function (error) {
				logger.error(`PROMISE ERR: ${error.stack}`);
			});
		// TODO: rewrite as promise
	}
});

exports.MasterPassPrompt = function (reset, callback) {
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
		logger.verbose('IPCMAIN: checkMasterPass emitted. Checking MasterPass...');
		// TODO: Clean this up and remove redundancies
		MasterPass.check(masterpass, function (err, match, mpkey) {
			if (err) {
				//send error
				webContents.send('checkMasterPassResult', err);
				callback(err);
			}
			if (match) {
				logger.info("IPCMAIN: PASSWORD MATCHES!");
				// Now derive masterpasskey and set it (temporarily)
				global.MasterPassKey.set(mpkey);
				webContents.send('checkMasterPassResult', {
					err: null,
					match: match
				});
				gotMP = true;
				setTimeout(function () {
					win.close();
				}, 1000);
			} else {
				logger.warn("IPCMAIN: PASSWORD DOES NOT MATCH!");
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
		logger.verbose('IPCMAIN: setMasterPass emitted, Setting Masterpass...');
		MasterPass.set(masterpass, function (err, mpkey) {
			// TODO: create new Vault, delete old data and start re-encrypting
			if (!err) {
				newMPset = true;
				global.MasterPassKey.set(mpkey);
				global.mdb.saveGlobalObj('creds')
					.catch((err) => {
						throw err;
					});
				webContents.send('setMasterPassResult', null);
			} else {
				webContents.send('setMasterPassResult', err);
			}
		});
	});
	win.on('closed', function () {
		logger.info('win.closed event emitted for Settings.');
		win = null;
		// callback(((reset) ? newMPset : null));
		if (gotMP) {
			callback();
		} else {
			app.quit();
		}
	});

	return win;
};
