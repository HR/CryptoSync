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
	Account = require('./src/Account'),
	// sync = require('./src/sync'),
	fs = require('fs-plus'),
	https = require('https'),
	moment = require('moment'),
	base64 = require('base64-stream'),
	chalk = require('chalk'),
	Positioner = require('electron-positioner'),
	_ = require('lodash'),
	google = require('googleapis'),
	async = require('async');

const SETUPTEST = false; // ? Setup : Menubar

// TODO: USE ES6 Generators for asynchronously getting files, encryption and then uploading them
// TODO: consider using 'q' or 'bluebird' promise libs later
// TODO: consider using arrow callback style I.E. () => {}
// YOLO#101

// MasterPass is protected (private var) and only exist in Main memory
global.MasterPass = require('./src/MasterPass');
// TODO: CHANGE USAGE OF gAuth SUPPORT MULTIPLE ACCOUNTS
global.gAuth;
global.accounts = {};
// global.state = {};
// global.state.toget = [];
// global.state.tocrypt = [];
// global.state.toput = [];
/* Global state
 has three queues:
 - toget: files to download (incl. updated ones)
 - tocrypt: files to encrypt
 - toput: files to upload (/update)
*/

global.stats = {};
global.paths = {
	home: `${fs.getHomeDirectory()}/CryptoSync`,
	crypted: `${fs.getHomeDirectory()}/CryptoSync/.encrypted`,
	mdb: `${app.getPath('userData')}/mdb`,
	userData: app.getPath('userData'),
	vault: `${fs.getHomeDirectory()}/CryptoSync/Vault`,
	gdriveSecret: `${app.getPath('userData')}/client_secret_gdrive.json`,
	// dropboxSecret: `${app.getPath('userData')}/client_secret_dropbox.json`
};

// TODO: Get from mdb as JSON and store as JSON as one value
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
		let regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
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
		console.log('createSetup UNRESPONSIVE');
	});

	webContents.on('did-navigate', function (event, url) {
		console.log(`IPCMAIN: did-navigate emitted,\n URL: ${url}`);
		const regex = /^http:\/\/localhost/g;
		if (regex.test(url)) {
			console.log("localhost URL matches");
			win.loadURL(`${global.views.setup}?nav_to=auth`);
			// console.log('MAIN: url matched, sending to RENDER...');
			let err = getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				let auth_code = getParam("code", url);
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

				let getAccountInfo = function () {
					return new Promise(function (resolve, reject) {
						console.log('PROMISE: getAccountInfo');
						global.drive.about.get({
							"fields": "storageQuota,user"
						}, function (err, res) {
							if (err) {
								console.log(`IPCMAIN: drive.about.get, ERR occured, ${err}`);
								reject(err);
							} else {
								console.log(`IPCMAIN: drive.about.get, RES:`);
								console.log(`\nemail: ${res.user.emailAddress}\nname: ${res.user.displayName}\nimage:${res.user.photoLink}\n`);
								// get the account photo and convert to base64
								resolve(res);
							}
						});
					});
				};

				let getPhoto = function (res) {
					console.log('PROMISE: getPhoto');
					return new Promise(
						function (resolve, reject) {
							https.get(res.user.photoLink, function (pfres) {
								if (pfres.statusCode === 200) {
									let stream = pfres.pipe(base64.encode());
									streamToString(stream, (profileImgB64) => {
										console.log(`SUCCESS: https.get(res.user.photoLink) retrieved res.user.photoLink and converted into ${profileImgB64.substr(0, 20)}...`);
										// Now set the account info
										resolve([profileImgB64, res]);
									});
								} else {
									reject(`ERROR: https.get(res.user.photoLink) failed to retrieve res.user.photoLink, pfres code is ${pfres.statusCode}`);
								}
							});
						}
					);
				};

				let setAccountInfo = function (param) {
					console.log('PROMISE: setAccountInfo');
					let profileImgB64 = param[0],
						res = param[1];
					return new Promise(function (resolve, reject) {
						let accName = `${res.user.displayName.toLocaleLowerCase().replace(/ /g,'')}_drive`;
						console.log(`Accounts object key, accName = ${accName}`);
						// Add account to global acc obj
						global.accounts[accName] = new Account("gdrive", res.user.displayName, res.user.emailAddress, profileImgB64, {
							"limit": res.storageQuota.limit,
							"usage": res.storageQuota.usage,
							"usageInDrive": res.storageQuota.usageInDrive,
							"usageInDriveTrash": res.storageQuota.usageInDriveTrash
						}, gAuth);
						resolve(res.user.emailAddress);
					});
				};

				// TODO: Implement recursive function
				function fetchFolderItems(folderId, callback) {
					let fsuBtree = [];
					global.drive.files.list({
						q: `'${folderId}' in parents`,
						orderBy: 'folder desc',
						fields: 'files(fullFileExtension,id,md5Checksum,mimeType,modifiedTime,name,ownedByMe,parents,properties,size,webContentLink,webViewLink),nextPageToken',
						spaces: 'drive',
						pageSize: 1000
					}, function (err, res) {
						if (err) {
							callback(err, null);
						} else {
							// if (res.nextPageToken) {
							// 	console.log("Page token", res.nextPageToken);
							// 	pageFn(res.nextPageToken, pageFn, callback(null, res.files)); // TODO: replace callback; HANdLE THIS
							// }
							// if (recursive) {
							// 	console.log('Recursive fetch...');
							// 	for (var i = 0; i < res.files.length; i++) {
							// 		let file = res.files[i];
							// 		if (_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
							// 			console.log('Iteration folder: ', file.name, file.id);
							// 			fetchFolderItems(file, true, callback, fsuBtree);
							// 			if (res.files.length === i) {
							// 				// return the retrieved file list (fsuBtree) to callee
							// 				return fetchFolderItems(file, true, callback, fsuBtree);
							// 			}
							// 		} else {
							// 			fsuBtree[file.id] = file;
							// 		}
							// 	};
							// } else { // do one Iteration and ignore folders}
							for (var i = 0; i < res.files.length; i++) {
								let file = res.files[i];
								if (!_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
									console.log(`root/${folderId}/  ${file.name} ${file.id}`);
									fsuBtree.push(file);
								}
							}
							callback(null, fsuBtree);
						}
					});
				};

				// Get auth token from auth code
				gAuth.getToken(auth_code)
					.then(storeToken)
					.then(InitDrive)
					.then(getAccountInfo)
					.then(getPhoto)
					.then(setAccountInfo)
					.then(function (email) {
						// get all drive files and start downloading them
						console.log(`PROMISE for retrieving all of ${email} files`);
						return new Promise(
							function (resolve, reject) {
								let fBtree = [],
									folders = [],
									root,
									rfsTree = {};
								// TODO: Implement Btree for file directory structure
								console.log('PROMISE: getAllFiles');
								console.log(`query is going to be >> 'root' in parents and trashed = false`);
								global.drive.files.list({
									q: `'root' in parents and trashed = false`,
									orderBy: 'folder desc',
									fields: 'files(fullFileExtension,id,md5Checksum,mimeType,modifiedTime,name,ownedByMe,parents,properties,size,webContentLink,webViewLink),nextPageToken',
									spaces: 'drive',
									pageSize: 1000
								}, function (err, res) {
									if (err) {
										reject(err);
									}
									if (res.files.length == 0) {
										console.log('No files found.');
										reject('No files found so no need to proceed');
									} else {
										console.log('Google Drive files (depth 2):');
										root = res.files[0].parents[0];
										rfsTree[root] = {};
										rfsTree[root]['path'] = `/`;

										for (let i = 0; i < res.files.length; i++) {
											let file = res.files[i];
											if (_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
												console.log(`Folder ${file.name} found. Calling fetchFolderItems...`);
												folders.push(file.id);
												rfsTree[file.id] = file;
												rfsTree[file.id]['path'] = `${rfsTree[file.parents[0]]['path']}${file.name}`;
											} else {
												console.log('root/ %s (%s)', file.name, file.id);
												fBtree.push(file);
											}
										}
										// TODO: map folderIds to their respective files & append to the toget arr
										async.map(folders, fetchFolderItems, function (err, fsuBtree) {
											console.log(`Got ids: ${folders}. Calling async.map(folders, fetchFolderItem,...) to map`);
											if (err) {
												console.log(`Errpr while mapping folders to file array: ${err}`);
												reject(err);
											} else {
												// console.log(`Post-callback ${JSON.stringify(fsuBtree)}`);
												fBtree.push(_.flattenDeep(fsuBtree));
												console.log(`Got fsuBtree: ${fsuBtree}`);
												resolve([fBtree, rfsTree]);
											}
										});
										// TODO: FIX ASYNC issue >> .then invoked before fetchFolderItems finishes entirely (due to else clause always met
									}
								});
							}
						);
					})
					.then(function (trees) {
						console.log(`\n THEN saving file tree (fBtree) to global.state.toget`);
						global.state = {};
						global.state.toget = _.flattenDeep(trees[0]);
						global.state.tocrypt = [];
						global.state.toput = [];
						global.state.rfs = trees[1];
					})
					.then((value) => {})
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
		setMasterPass(masterpass, function (err) {
			global.MasterPass.set(masterpass);
			webContents.send('setMasterPassResult', err);
		});
	});

	ipc.on('done', function (event, masterpass) {
		console.log('IPCMAIN: done emitted, setup complete. Closing this window and opening menubar...');
		setupComplete = true;
		win.close();
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

function addAccountPrompt(callback) {
	function getParam(name, url) {
		name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
		let regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
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
			let err = getParam("error", url);
			// if error then callback URL is http://localhost/?error=access_denied#
			// if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
			if (!err) {
				let auth_code = getParam("code", url);
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
		console.log('win.closed event emitted for createSettings.');
		win = null;
		callback();
	});
}

function masterPassPrompt(reset, callback) {
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
		checkMasterPass(masterpass, function (err, match) {
			if (err) {
				//send error
				webContents.send('checkMasterPassResult', err);
				callback(err);
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
function createErrorPrompt(err, callback) {
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
	return new Promise(function (resolve, reject) {
		fs.makeTreeSync(global.paths.home);
		fs.makeTreeSync(global.paths.mdb);
		fs.makeTreeSync(global.paths.vault);
		resolve();
	});
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
	console.log(`APP.ON('will-quit'): will-quit event emitted`);
	console.log(`platform is ${process.platform}`);
	// TODO: Cease any db OPs; encrypt vault before quitting the app and dump to fs
	// global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client.credentials = global.gAuth.credentials;
	global.stats.endTime = moment().format();

	var saveGlobalObj = function (objName) {
		console.log(`PROMISE: saveGlobalObj for ${objName}`);
		return new Promise(function (resolve, reject) {
			if (!(_.isEmpty(global[objName]))) {
				global.mdb.put(objName, JSON.stringify(global[objName]), function (err) {
					if (err) {
						console.log(`ERROR: mdb.put('${objName}') failed, ${err}`);
						// I/O or other error, pass it up the callback
						reject(err);
					}
					console.log(`SUCCESS: mdb.put('${objName}')`);
					resolve();
				});
			} else {
				console.log('Nothing to save; empty.');
				resolve();
			}
		});
	};

	Promise.all([
		saveGlobalObj('accounts'),
		saveGlobalObj('state'),
		saveGlobalObj('settings'),
		saveGlobalObj('files'),
		saveGlobalObj('stats')
	]).then(function () {
		console.log('Closing vault and mdb. Calling vault.close() and mdb.close()');
		// global.vault.close();
		global.mdb.close(function() {
			crypto.encryptDB(global.paths);
		});
	}, function (reason) {
		console.log(`PROMISE ERR (reason): `, reason);
	}).catch(function (error) {
		console.error(`PROMISE ERR: ${error.stack}`);
	});
});

app.on('activate', function (win) {
	console.log('activate event emitted');
	// 	if (!win) {
	// 		win = createMainWindow();
	// 	}
});

app.on('ready', function () {
	// TODO: Wrap all this into init();
	// let firstRun = (!fs.isDirectorySync(global.paths.home)) && (!fs.isFileSync(global.paths.mdb));
	if (SETUPTEST) {
		// TODO: Do more extensive FIRST RUN check
		console.log('First run. Creating Setup wizard...');
		// Setup();
		let Init = function () {
			console.log(`INITIALISATION PROMISE`);
			return new Promise(function (resolve, reject) {
				global.mdb = new Db(global.paths.mdb);
				resolve();
			});
		};
		// TODO: Wrap Setup around createSetup and call Setup the way its being called now
		// Run User through Setup/First Install UI
		Init()
			.then(
				global.mdb.del('gdrive-token', function (err) {
					if (err) console.log(`Error retrieving gdrive-token, ${err}`);
					console.log("deleted gdrive-token");
				})
			)
			// .then(
			// 	global.mdb.del('state', function (err) {
			// 		if (err) console.log(`Error retrieving state, ${err}`);
			// 		console.log("deleted state");
			// 	})
			// )
			.then(
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
		// TODO: Implement masterPassPrompt function

		/* TODO: Implement all objects to restore from persistent storage as a routine to be run on start
		 * TODO: Consider whether to use Obj.change flag on accounts (potentially other Objs) to protect from accidental changes and corruption (by sys)?
		 */
		let Init = function () {
			// Decrypt db (the Vault) and get ready for use
			// open mdb
			return new Promise(function (resolve, reject) {
				global.mdb = new Db(global.paths.mdb);
				resolve();
			});
		};

		let getValue = function (key) {
			console.log(`PROMISE: getValue for ${key}`);
			return new Promise(function (resolve, reject) {
				global.mdb.get(key, function (err, json) {
					if (err) {
						if (err.notFound) {
							console.log(`ERROR: key ${key} NOT FOUND `);
							reject(err);
						} else {
							// I/O or other error, pass it up the callback
							console.log(`ERROR: mdb.get('${key}') FAILED`);
							reject(err);
						}
					} else {
						console.log(`SUCCESS: ${key} FOUND`);
						resolve(json);
					}
				});
			});
		};

		// Restore accounts object from DB promise
		let restoreGlobalObj = function (objName) {
			console.log(`PROMISE: restoreGlobalObj for ${objName}`);
			return new Promise(function (resolve, reject) {
				global.mdb.get(objName, function (err, json) {
					if (err) {
						if (err.notFound) {
							console.log(`ERROR: Global obj ${objName} NOT FOUND `);
							reject(err);
						} else {
							// I/O or other error, pass it up the callback
							console.log(`ERROR: mdb.get('${objName}') FAILED`);
							reject(err);
						}
					} else {
						console.log(`SUCCESS: ${objName} FOUND`);
						try {
							global[objName] = JSON.parse(json) || {};
							setTimeout(function () {
								console.log(`resolve global.${objName} called`);
								resolve();
							}, 0);
						} catch (e) {
							return e;
						}
					}
				});
			});
		};

		Init()
			.catch(function (error) {
				console.error(`PROMISE ERR: ${error.stack}`);
			});
		// TODO: rewrite as promise
		masterPassPrompt(null, function (err) {
			if (err) {
				throw err;
			} else {
				Promise.all([
						restoreGlobalObj('accounts'),
						restoreGlobalObj('state'),
						restoreGlobalObj('settings'),
						restoreGlobalObj('stats'),
						restoreGlobalObj('files'),
					])
					.then(() => {
						let o2c = global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client;
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
					})
					.then(() => {
						if (global.state.toget) {
							/* TODO: Evaluate the use of async.queues where a queue task is created
									forEach file and the task is to first get the file then encrypt and then
									upload. See if persistently viable (i.e. can continue where left of on
									program restart)
							*/
							async.each(global.state.toget, function (file, callback) {
								let parentPath = global.state.rfs[file.parents[0]].path;
								let dir = `${global.paths.home}${parentPath}`;
								fs.makeTree(dir, function () {
									let path = (parentPath === "/") ? `${dir}${file.name}` : `${dir}/${file.name}`;
									console.log(`GETing ${file.name} at dest ${path}`);
									let dest = fs.createWriteStream(path);
									// TODO: figure out a better way of limiting API requests to less than 10/s (Google API limit)
									setTimeout(function () {
										global.drive.files.get({
												fileId: file.id,
												alt: 'media'
											})
											.on('end', function () {
												console.log(`GOT ${file.name} ${file.id} at dest ${path}. Moving this file obj to tocrypt`);
												global.state.tocrypt.push(file); // add from tocrypt queue
												_.pull(global.state.toget, file); // remove from toget queue
												callback(null, file.id, file.name);
											})
											.on('error', function (err) {
												console.log('Error during download', err);
												callback(err, file.id, file.name);
											})
											.pipe(dest);
									}, 600);
								});
							}, function (err, fileId, fileName) {
								// if any of the file processing produced an error, err would equal that error
								if (err) {
									// One of the iterations produced an error.
									// All processing will now stop.
									console.error(`Failed to get ${fileName} (${fileId}), err: ${err.stack}`);
								} else {
									console.log(`To trigger tocrypt for ${fileName} (${fileId})`);
								}
							});
						}

						if (global.state.tocrypt) {
							// global.state.tocrypt.push(global.state.toput[0]);
							// global.state.toput.pop();
							fs.makeTree(global.paths.crypted, function () {
								let file = global.state.tocrypt[0];
								console.log(`TO encrypt ${file.name} (${file.id})`);
								let parentPath = global.state.rfs[file.parents[0]].path;
								let origpath = (parentPath === "/") ? `${global.paths.home}${parentPath}${file.name}` : `${global.paths.home}${parentPath}/${file.name}`;
								let destpath = `${global.paths.crypted}/${file.name}.crypto`;
								console.log(`origpath: ${origpath}, destpath: ${destpath}`);
								crypto.encrypt(origpath, destpath, global.MasterPass.get(), function (err, keyiv) {
									if (err) {
										console.error(`Error while encrypting ${err.stack}`);
										// callback(err, file.id, file.name);
									} else {
										file.cryptpath = destpath;
										file.iv = keyiv[1];
										console.log(`Done encrypting ${file.name} (${file.id}) to ${destpath}`);
										// global.state.toput.push(file);
										// _.pull(global.state.tocrypt, file);
										// callback(null, file.id, file.name);
									}
								});
								// async.each(global.state.tocrypt, function (file, callback) {
								// 	let parentPath = global.state.rfs[file.parents[0]].path;
								// 	let origpath = (parentPath === "/") ? `${global.paths.home}${parentPath}${file.name}` : `${global.paths.home}${parentPath}/${file.name}`;
								// 	let destpath = `${global.paths.crypted}/${file.name}.crypto`;
								// 	// console.log(`origpath: ${origpath}, destpath: ${destpath}`);
								// 	crypto.encrypt(origin, dest, global.MasterPass.get(), function (err, keyiv) {
								// 		if (err) {
								// 			callback(err, file.id, file.name);
								// 		} else {
								// 			let key = keyiv[0],
								// 				iv = keyiv[1];
								// 			file.cryptpath = destpath;
								// 			global.state.toput.push(file);
								// 			_.pull(global.state.tocrypt, file);
								// 			callback(null, file.id, file.name);
								// 		}
								// 	});
								// }, function (err, fileId, fileName) {
								// 	// if any of the file processing produced an error, err would equal that error
								// 	if (err) {
								// 		// One of the iterations produced an error.
								// 		// All processing will now stop.
								// 		console.error(`Failed to encrypt ${fileName} (${fileId}), err: ${err.stack}`);
								// 	} else {
								// 		console.log(`To trigger tocrypt for ${fileName} (${fileId})`);
								// 	}
								// });
							});
						}
					})
					.then(
						// TODO: start sync daemon
						// Start menubar
						Cryptobar(function (result) {
							// body...
						})
					)
					.catch(function (error) {
						console.error(`PROMISE ERR: ${error.stack}`);
					});

			}
		});

		// if (!global.MasterPass.get()) {
		// 	masterPassPrompt(null, function (err) {
		// 		if (err) {
		// 			console.log(`ERROR: ${err}`);
		// 		}
		// 	});
		// }
		// global.mdb = new Db(global.paths.mdb);
		// global.vault = new Db(global.paths.vault);
	}
});
