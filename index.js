'use strict';
const app = require('electron').app;
const BrowserWindow = require('electron').BrowserWindow;
const ipc = require('electron').ipcMain;
const fs = require('fs-plus');
let Db = require('./src/Db');

// enable remote debugging
// app.commandLine.appendSwitch('remote-debugging-port', '8315');
// app.commandLine.appendSwitch('host-rules', 'MAP * 127.0.0.1');

// report crashes to the Electron project
require('crash-reporter').start();

// adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')();

// prevent window being garbage collected
let mainWindow;
global.paths = {
	home: fs.getHomeDirectory()+"/CryptoSync",
	mdb: fs.getHomeDirectory()+"/CryptoSync/csmdb",
};

// Check for connection status
ipc.on('online-status-changed', function(event, status) {
	console.log(status);
});

function onClosed() {
	// dereference the window
	// for multiple windows store them in an array
	// TO DO: encryot the db
	console.log("win.closed event emitted;\n Calling on onClosed");
	mainWindow = null;
}

function createMainWindow() {
	const win = new BrowserWindow({
		width: 600,
		height: 400
	});

	win.loadURL(`file://${__dirname}/static/index.html`);
	win.webContents.on('did-finish-load', function() {
		// Query all cookies.
		win.webContents.session.cookies.get({}, function(error, cookies) {
			if (error) throw error;

		});

		// Set a cookie with the given cookie data;
		// may overwrite equivalent cookies if they exist.
		win.webContents.session.cookies.set(
			{ url : "http://crypto.sync", name : "MasterPass", value : "aPrettyGoodPassword", session : true},
			function(error, cookies) {
				if (error) throw error;

				// Query all cookies.
				win.webContents.session.cookies.get({}, function(error, cookies) {
					if (error) throw error;
					console.log(cookies);
				});
		});

	});
	win.on('closed', onClosed);

	return win;
}

function createMasterPassPrompt() {
	// var BrowserWindow = require('electron').remote.BrowserWindow;
	// BrowserWindow.addDevToolsExtension('../devTools/react-devtools/shells/chrome');
	const win = new BrowserWindow({
		width: 400,
		height: 460
		// resizable: false,
		// center: true
	});
	win.loadURL(`file://${__dirname}/static/masterpassprompt.html`);
	win.openDevTools();
	win.webContents.on('did-finish-load', function() {
		// Set a cookie with the given cookie data;
		// may overwrite equivalent cookies if they exist.
		// win.webContents.session.cookies.set(
		// 	{ url : "http://crypto.sync", name : "MasterPass", value : "aPrettyGoodPassword", session : true},
		// 	function(error, cookies) {
		// 		if (error) throw error;

		// console.log("win.getContentSize(): "+win.getContentSize());
		// 		// Query all cookies.
		// win.webContents.session.cookies.get({}, function(error, cookies) {
		// 	if (error) throw error;
		// 	console.log("GET cookies: "+cookies);
		// });
	});

	ipc.on('masterpass-submitted', function(event, masterpass) {
		console.log("masterpass-submitted event emitted"+masterpass);
	});

	ipc.on("echoDOM", function(event, dom) {
		console.log(dom);
	});

	win.on('closed', onClosed);

	return win;
}

function init() {
	// Decrypt db (the Vault) and get ready for use
	global.db = new Db(paths.mdb, MasterPass);
}

function Setup() {
	// Guide user through setting up a MasterPass and connecting to cloud services
	fs.makeTreeSync(paths.home);

}

app.on('window-all-closed', () => {
	console.log("window-all-closed event emitted");
	if (process.platform !== 'darwin') {
		// Cease any db OPs; encrypt database before quitting the app
		console.log("Calling db.close()");
		db.close();
		app.quit();
	}
});

app.on('activate-with-no-open-windows', () => {
	console.log("activate-with-no-open-windows event emitted");
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});

app.on('ready', () => {
	let firstRun = (!fs.isDirectorySync(paths.home)) && (!fs.isFileSync(paths.mdb));
	if (firstRun) {
		Setup();
	} else {
		// Run User through Setup/First Install UI
		// start menubar
		let masterPassPrompt = createMasterPassPrompt();
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
