'use strict';
const app = require('app');
const BrowserWindow = require('browser-window');
const ipc = require('ipc');
const fs = require('fs-plus');
let db = require('src/elements/db');

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
	mainWindow = null;
}

function createMainWindow() {
	const win = new BrowserWindow({
		width: 600,
		height: 400
	});

	win.loadUrl(`file://${__dirname}/static/index.html`);
	win.on('closed', onClosed);

	return win;
}

function init() {
  // Check whether it is the first start after install
  if (!fs.isDirectorySync(paths.home)) {
    fs.makeTreeSync(paths.home);
  }
  global.db = new Db(paths.mdb);
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
    db.close();
		app.quit();
	}
});

app.on('activate-with-no-open-windows', () => {
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});

app.on('ready', () => {
  init();
	mainWindow = createMainWindow();
  // var appIcon = new Tray('static/images/mb/trayic_light.png');
});
