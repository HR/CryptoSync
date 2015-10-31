const app = require('app');
const BrowserWindow = require('browser-window');
var path = require('path');
var events = require('events');
var fs = require('fs');
var Tray = require('tray');
var AutoLaunch = require('auto-launch');
var Menu = require('menu');
var ipc = require('ipc');

// report crashes to the Electron project
require('crash-reporter').start();

// adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')();

// var extend = require('extend') TO remove
var Positioner = require('electron-positioner');

var autoStart = new AutoLaunch({
  name: 'Crypto.Sync',
  path: process.execPath.match(/.*?\.app/)[0]
});

var defaults = {
  iconMain: path.join(__dirname, 'static/images/', 'AppIcon.png'),
  iconIdle: path.join(__dirname, 'static/images/mb', 'tray-idleTemp.png'),
  iconActive: path.join(__dirname, 'static/images/mb', 'tray-active.png'),
  index: 'file://' + path.join(this.dir, '/static/mbindex.html'),
  width: 300,
  height: 400,
};

app.on('ready', function () {
  if (app.dock && !opts.showDockIcon) app.dock.hide();

  var iconPath = defaults.iconMain;

  var cachedBounds; // cachedBounds are needed for double-clicked event

  menubar.tray = opts.tray || new Tray(iconPath);

  menubar.tray
    .on('clicked', clicked)
    .on('double-clicked', clicked);

  if (opts.preloadWindow) {
    createWindow();
  }

  menubar.showWindow = showWindow;
  menubar.hideWindow = hideWindow;

  menubar.positioner;

  menubar.emit('ready');

  function clicked (e, bounds) {
    if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return hideWindow();

    if (menubar.window && menubar.window.isVisible()) return hideWindow();

    // double click sometimes returns `undefined`
    bounds = bounds || cachedBounds;

    cachedBounds = bounds;
    showWindow(cachedBounds);
  }

  function createWindow () {
    menubar.emit('create-window');
    var defaults = {
      show: false,
      frame: false
    };

    var winOpts = extend(defaults, opts);
    menubar.window = new BrowserWindow(winOpts);

    menubar.positioner = new Positioner(menubar.window);

    if (!opts['always-on-top']) {
      menubar.window.on('blur', hideWindow);
    }

    if (opts['show-on-all-workspaces'] !== false) {
      menubar.window.setVisibleOnAllWorkspaces(true);
    }

    menubar.window.loadUrl(opts.index);
    menubar.emit('after-create-window');
  }

  function showWindow (trayPos) {
    if (!menubar.window) {
      createWindow();
    }

    menubar.emit('show');

    // Default the window to the right if `trayPos` bounds are undefined or null.
    var noBoundsPosition = null;
    if ((trayPos === undefined || trayPos.x === 0) && opts['window-position'].substr(0, 4) === 'tray') {
      noBoundsPosition = (process.platform === 'win32') ? 'bottomRight' : 'topRight';
    }

    var position = menubar.positioner.calculate(noBoundsPosition || opts['window-position'], trayPos);

    var x = (opts.x !== undefined) ? opts.x : position.x;
    var y = (opts.y !== undefined) ? opts.y : position.y;

    menubar.window.setPosition(x, y);
    menubar.window.show();
    menubar.emit('after-show');
    return;
  }

  function hideWindow () {
    if (!menubar.window) return;
    menubar.emit('hide');
    menubar.window.hide();
    menubar.emit('after-hide');
  }
});
