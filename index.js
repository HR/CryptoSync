'use strict';
const app = require('app');
const BrowserWindow = require('browser-window');
const ipc = require('ipc');
const fs = require('fs-plus');
let Db = require('./src/Db');

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
  console.log("win.closed event emitted;\n Calling on onClosed");
	mainWindow = null;
}

function createMainWindow() {
	const win = new BrowserWindow({
		width: 600,
		height: 400
	});

	win.loadUrl(`file://${__dirname}/static/index.html`);
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

function init() {
  // Decrypt db (the Vault) and gey ready for use
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
    init()
    // Prompt for MasterPass OR retrieve temporarily stored MasterPass
    // (if user has select the store MasterPass tenporarily)
    // > look into persistent cookies/sessions to temporarily store MasterPass
    // sessions are shared between open windows
    // so cookies set in either main window/menubar accessible in either
    mainWindow = createMainWindow();
    // MasterPassPromptWindow = createMPassPromptWindow();
  }
  // var appIcon = new Tray('static/images/mb/trayic_light.png');
});
