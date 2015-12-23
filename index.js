'use strict';
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;
// const Menu = electron.Menu;
// const Tray = electron.Tray;
const OAuth = require('./src/OAuth');
const fs = require('fs-plus');
const Db = require('./src/Db');
global.gAuth;
global.paths = {
	home: fs.getHomeDirectory() + "/CryptoSync",
	mdb: app.getPath("userData") + "/mdb",
	userData: app.getPath("userData"),
	vault: fs.getHomeDirectory() + "/CryptoSync/Vault",
};

global.views = {
	main: `file://${__dirname}/static/index.html`,
	masterpassprompt: `file://${__dirname}/static/masterpassprompt.html`,
	setup: `file://${__dirname}/static/setup.html`
};


// logProp(global.paths);
// logProp(app);

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

// prevent window being garbage collected
let mainWindow;

// function createMainWindow() {
//	 const win = new BrowserWindow({
//		 width: 600,
//		 height: 400
//	 });
//
//	 win.loadURL(global.views.main);
//	 win.webContents.on('did-finish-load', function() {
//		 // Query all cookies.
//		 win.webContents.session.cookies.get({}, function(error, cookies) {
//			 if (error) throw error;
//
//		 });
//
//		 // Set a cookie with the given cookie data;
//		 // may overwrite equivalent cookies if they exist.
//		 win.webContents.session.cookies.set(
//			 { url : "http://crypto.sync", name : "MasterPass", value : "aPrettyGoodPassword", session : true},
//			 function(error, cookies) {
//				 if (error) throw error;
//
//				 // Query all cookies.
//				 win.webContents.session.cookies.get({}, function(error, cookies) {
//					 if (error) throw error;
//					 console.log(cookies);
//				 });
//		 });
//
//	 });
//	 win.on('closed', onClosed);
//
//	 return win;
// }

/**
 * Window constructors
 **/

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
	ipc.on('masterpass-submission', function(event, masterpass, intype) {
		if (intype === "default") {
			console.log("Decrypting DB using masspass... using masterpass:" + masterpass);
			// Db.decrypt(global.paths.vault, masspass, function(succ, err) {
			//	 // body...
			// });
		}
	});

	win.on('closed', onClosed);

	return win;
}

function createSetup() {
	// var BrowserWindow = require('electron').remote.BrowserWindow;
	// BrowserWindow.addDevToolsExtension('../devTools/react-devtools/shells/chrome');
	var win = new BrowserWindow({
		width: 800,
		height: 400,
		center: true,
		show: true
			// width: 400,
			// height: 460
			// resizable: false,
	});
	var webContents = win.webContents;
	win.loadURL(global.views.setup);
	win.openDevTools();
	ipc.on('initAuth', function(event, type) {
		console.log("initAuth emitted. Creating gAuth...");
		// if (type === "gdrive") {
		var secretPath = paths.userData + "/client_secret_gdrive.json";
			global.gAuth = new OAuth(type, secretPath);
			global.gAuth.authorize(global.mdb, function(authUrl) {
				if (authUrl) {
					console.log("Loading authUrl... " + authUrl);
					win.loadURL(authUrl, {"extraHeaders" : "pragma: no-cache\n"});
				} else {
					console.log("As already exists, loading home...");
					win.loadURL(global.views.setup + "?nav_to=masterpass");
				}
			});
		// }
	});

	win.on("unresponsive", function(event) {
		console.log("createSetup UNRESPONSIVE");
	});


	webContents.on("will-navigate", function(event, url) {
		console.log("IPCMAIN will-navigate emitted,\n URL: " + url + "\n");
		var regex = /http:\/\/localhost/g;
		if (regex.test(url)) {
			// win.loadURL(global.views.setup);
			event.preventDefault();
			win.loadURL(global.views.setup + "?nav_to=auth");
			console.log("MAIN: url matched, sending to RENDER...");
			webContents.on('did-finish-load', function() {
				webContents.send("auth-result", url);
			});
		}
	});

	ipc.on('masterpass-submission', function(event, masterpass, intype) {
		if (intype === "default") {
			console.log("Masterpass setting...");
			// Db.decrypt(global.paths.vault, masspass, function(succ, err) {
			// 	// body...
			// });
		}
	});

	win.on('closed', onClosed);

	return win;
}

function createMenubar() {
	// Implement menubar
}

/**
 * Functions
 **/

function Setup() {
	// Guide user through setting up a MasterPass and connecting to cloud services
	// TO DO: transform into Async using a Promise
	fs.makeTreeSync(global.paths.home);
	fs.makeTreeSync(global.paths.vault);
	global.mdb = new Db(global.paths.mdb);
	// Setup routine
	let setupWindow = createSetup();
}


function init() {
	// Decrypt db (the Vault) and get ready for use
	// create mdb
	global.vault = new Db(global.paths.vault, MasterPass);
}

/**
 * Event handlers
 **/

function onClosed() {
	// dereference the window
	// for multiple windows store them in an array
	// TO DO: encryot the db
	console.log("win.closed event emitted;\n Calling on onClosed");
	global.mdb.close();
	mainWindow = null;
}

// Check for connection status
ipc.on('online-status-changed', function(event, status) {
	console.log(status);
});

app.on('window-all-closed', () => {
	console.log("window-all-closed event emitted");
	if (process.platform !== 'darwin') {
		// Cease any db OPs; encrypt database before quitting the app
		console.log("Calling db.close()");
		global.vault.close();
		app.quit();
	}
});

app.on('activate', () => {
	console.log("activate event emitted");
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});

app.on('ready', () => {
	let firstRun = (!fs.isDirectorySync(global.paths.home)) && (!fs.isFileSync(global.paths.mdb));
	if (firstRun) {
		console.log("First run. Creating Setup wizard...");
		Setup();
	} else {
		// Run User through Setup/First Install UI
		// start menubar
		// console.log("Normal run. Creating MasterPass prompt...");
		// let masterPassPrompt = createMasterPassPrompt();
		global.mdb = new Db(global.paths.mdb);

		console.log("Normal run. Creating Setup...");
		mainWindow = createSetup();
		//init();
		// Prompt for MasterPass OR retrieve temporarily stored MasterPass
		// (if user has select the store MasterPass tenporarily)
		// > look into persistent cookies/sessions to temporarily store MasterPass
		// sessions are shared between open windows
		// so cookies set in either main window/menubar accessible in either
		//mainWindow = createMainWindow();
		// MasterPassPromptWindow = createMPassPromptWindow();
	}
	// var appIcon = new Tray('static/images/mb/trayic_light.png');
});
