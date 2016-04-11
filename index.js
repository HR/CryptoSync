'use strict'
const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const ipc = electron.ipcMain
const Tray = electron.Tray
const shell = electron.shell
const dialog = electron.dialog
const OAuth = require('./src/OAuth')
const util = require('./src/util')
const vault = require('./src/vault')
const MasterPass = require('./src/MasterPass')
const MasterPassKey = require('./src/_MasterPassKey')
const sync = require('./src/sync')
const init = require('./init')
const synker = require('./src/synker')
const moment = require('moment')
// const Vault_cl = require('./src/Vault_cl')
const Positioner = require('electron-positioner')
const _ = require('lodash')
const logger = require('./script/logger')
// change exec path
logger.info(`AppPath: ${app.getAppPath()}`)
logger.info(`__dirname: ${__dirname}`)
process.chdir(app.getAppPath())
logger.info(`Changed cwd to: ${process.cwd()}`)
// require('dotenv').config()

// App init
// app.dock.setIcon('res/app-icons/CryptoSync256.png')

// enable remote debugging
// app.commandLine.appendSwitch('remote-debugging-port', '8315')
// app.commandLine.appendSwitch('host-rules', 'MAP * 127.0.0.1')

// adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')()

// MasterPassKey is protected (private var) and only exist in Main memory
// MasterPassKey is a derived key of the actual user MasterPass
global.gAuth = {}
global.accounts = {}
global.creds = {}
global.state = {}
global.files = {}
global.stats = {}
global.paths = {
  home: `${app.getPath('home')}/CryptoSync`,
  crypted: `${app.getPath('home')}/CryptoSync/.crypto`,
  mdb: `${app.getPath('userData')}/mdb`,
  userData: app.getPath('userData'),
  vault: `${app.getPath('home')}/CryptoSync/vault.crypto`
}

logger.verbose(require('util').inspect(global.paths, { depth: null }))
global.settings = {
  user: {

  },
  default: {
    keyLength: '128',
    algorithm: 'CTR',
    randomness: 'Pseudo',
    MPkeyLength: '256',
    shares: 's2n3',
    autostart: 'true',
    offlineEnc: 'true'
  }
}
global.views = {
  main: `file://${__dirname}/static/index.html`,
  masterpassprompt: `file://${__dirname}/static/masterpassprompt.html`,
  setup: `file://${__dirname}/static/setup.html`,
  menubar: `file://${__dirname}/static/menubar.html`,
  errorprompt: `file://${__dirname}/static/errorprompt.html`,
  settings: `file://${__dirname}/static/settings.html`,
  vault: `file://${__dirname}/static/vault.html`
}

// prevent the following from being garbage collected
let Menubar
let exit = false

/**
 * Promises (global)
 **/

/**
 * Window constructors
 **/

function Cryptobar (callback) {
  function click (e, bounds) {
    if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) {
      return hideWindow()
    }

    if (win && win.isVisible()) {
      return hideWindow()
    }

    // double click sometimes returns `undefined`
    bounds = bounds || cachedBounds

    cachedBounds = bounds
    showWindow(cachedBounds)
  }

  function showWindow (trayPos) {
    // Default the window to the right if `trayPos` bounds are undefined or null.
    let noBoundsPosition = null
    if ((trayPos === undefined || trayPos.x === 0) && winPosition.substr(0, 4) === 'tray') {
      noBoundsPosition = (process.platform === 'win32') ? 'bottomRight' : 'topRight'
    }

    let position = positioner.calculate(noBoundsPosition || winPosition, trayPos)
    win.setPosition(position.x, position.y)
    webContents.send('updateMoments')
    win.show()
    return
  }

  function hideWindow () {
    if (!win) {
      return
    }
    // emit hide
    win.hide()
  // emitt after-hide
  }

  let win = new BrowserWindow({
    width: 500, // 290
    height: 312,
    frame: false,
    show: false
  // resizable: false
  })
  app.dock.hide()
  let cachedBounds
  const winPosition = (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter'
  const positioner = new Positioner(win)
  // TODO: Change icon based on mode (dark || light) on OSX and set default to light
  Menubar = new Tray('static/images/mb/trayic_light.png')
  Menubar.on('click', click)
    .on('double-click', click)

  win.on('blur', hideWindow)
  win.loadURL(global.views.menubar)
  win.openDevTools()
  const webContents = win.webContents

  // Event listeners
  sync.event.on('put', (file) => {
    logger.verbose(`PUT EVENT RECEIVED for ${file.name}`)
    webContents.send('synced', {
      name: file.name,
      fileType: file.fullFileExtension,
      type: 'gdrive',
      lastMoment: file.lastSynced,
      synced: 'Uploaded'
    })
  })

  sync.event.on('crypted', (file) => {
    logger.verbose(`PUT EVENT RECEIVED for ${file.name}`)
    webContents.send('synced', {
      name: file.name,
      fileType: file.fullFileExtension,
      type: 'gdrive',
      lastMoment: file.lastCrypted,
      synced: 'Encrypted'
    })
  })

  sync.event.on('statusChange', (status) => {
    logger.verbose(`statusChange: status changed to ${status}`)
    webContents.send('statusChange', status)
  })

  ipc.on('openSyncFolder', function (event) {
    logger.verbose('IPCMAIN: openSyncFolder event emitted')
    shell.showItemInFolder(global.paths.vault)
  })

  ipc.on('quitApp', function (event) {
    logger.verbose('IPCMAIN: quitApp event emitted Calling app.quit()...')
    app.quit()
  })

  ipc.on('openSettings', function (event) {
    logger.verbose('IPCMAIN: openSettings event emitted')
    Settings(function (result) {})
  })

  ipc.on('openVault', function (event) {
    logger.verbose('IPCMAIN: openVault event emitted')
    VaultUI(null)
  })

  win.on('closed', function () {
    logger.verbose('win.closed event emitted for Menubar.')
    win = null
    callback()
  })
}

function VaultUI (callback) {
  let win = new BrowserWindow({
    width: 700,
    height: 400,
    center: true,
    titleBarStyle: 'hidden-inset'
  })
  win.loadURL(global.views.vault)
  win.openDevTools()
  win.on('closed', function () {
    logger.verbose('win.closed event emitted for VaultUI.')
    win = null
    if (callback) callback()
  })
}

function Setup (callback) {
  let win = new BrowserWindow({
    width: 640,
    height: 420,
    center: true,
    show: true,
    titleBarStyle: 'hidden-inset'
  // width: 580,
  // height: 420
  // resizable: false,
  })

  let setupComplete = false
  let webContents = win.webContents
  win.loadURL(global.views.setup)
  win.openDevTools()
  ipc.on('initAuth', function (event, type) {
    logger.verbose('IPCMAIN: initAuth emitted. Creating Auth...')
    global.gAuth = new OAuth(type)
    global.mdb.onlyGetValue('gdrive-token').then((token) => {
      global.gAuth.authorize(token, function (authUrl) {
        if (authUrl) {
          logger.info(`Loading authUrl... ${authUrl}`)
          win.loadURL(authUrl, {
            'extraHeaders': 'pragma: no-cache\n'
          })
        } else {
          logger.warn('As already exists, loading masterpass...')
          win.loadURL(`${global.views.setup}?nav_to=masterpass`)
        }
      })
    })
  })

  win.on('unresponsive', function (event) {
    logger.verbose('Setup UNRESPONSIVE')
  })

  webContents.on('did-navigate', function (event, url) {
    logger.verbose(`IPCMAIN: did-navigate emitted URL: ${url}`)
    const regex = /^http:\/\/localhost\/\?(error|code)/g
    if (regex.test(url)) {
      logger.info('localhost URL matches')
      win.loadURL(`${global.views.setup}?nav_to=auth`)
      // logger.verbose('MAIN: url matched, sending to RENDER...')
      let err = util.getParam('error', url)
      // if error then callback URL is http://localhost/?error=access_denied#
      // if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
      if (!err) {
        let auth_code = util.getParam('code', url)
        logger.verbose(`IPCMAIN: Got the auth_code, ${auth_code}`)
        logger.verbose('IPCMAIN: Calling callback with the code...')

        global.gAuth.getToken(auth_code) // Get auth token from auth code
          // store auth token in mdb
          .then((token) => {
            global.gAuth.oauth2Client.credentials = token
            return global.mdb.storeToken(token)
          })
          .then(() => {
            return init.drive(global.gAuth)
          })
          .then(() => {
            return sync.getAccountInfo()
          })
          .then((res) => {
            return sync.getPhoto(res)
          })
          .then((param) => {
            return sync.setAccountInfo(param, global.gAuth)
          })
          .then((email) => {
            return sync.getAllFiles(email)
          })
          .then((trees) => {
            return init.syncGlobals(trees)
          })
          .catch(function (error) {
            logger.error(`PROMISE ERR: ${error.stack}`)
          })

        webContents.on('did-finish-load', function () {
          webContents.send('authResult', null)
        })
      } else {
        webContents.on('did-finish-load', function () {
          webContents.send('authResult', err)
        })
      }
    }
  })
  webContents.on('will-navigate', function (event, url) {
    logger.verbose(`IPCMAIN: will-navigate emitted URL: ${url}`)
  })

  ipc.on('setMasterPass', function (event, masterpass) {
    logger.verbose('IPCMAIN: setMasterPass emitted Setting Masterpass...')
    MasterPass.set(masterpass, function (err, mpkey) {
      global.MasterPassKey = new MasterPassKey(mpkey)
      global.mdb.saveGlobalObj('creds')
        .catch((err) => {
          throw err
        })
      webContents.send('setMasterPassResult', err)
    })
  })

  ipc.on('done', function (event, masterpass) {
    logger.info('IPCMAIN: done emitted setup complete. Closing this window and opening menubar...')
    setupComplete = true
    vault.init(global.MasterPassKey.get())
      .then(() => {
        return win.close()
      })
      .then(() => {
        return app.quit()
      })
      .catch((err) => {
        logger.error(`vault.init ERR: ${err.stack}`)
        throw (err)
      })
  })

  win.on('closed', function () {
    logger.verbose('IPCMAIN: win.closed event emitted for setupWindow.')
    win = null
    if (setupComplete) {
      callback(null)
    } else {
      callback(new Error('Setup did not finish successfully'))
    }
  })
}

function addAccountPrompt (callback) {
  let win = new BrowserWindow({
    width: 580,
    height: 420,
    center: true,
    show: true,
    titleBarStyle: 'hidden-inset'
  // width: 400,
  // height: 460
  // resizable: false,
  })
  let webContents = win.webContents
  win.loadURL(global.views.setup)
  win.openDevTools()
  ipc.on('initAuth', function (event, type) {
    logger.verbose('IPCMAIN: initAuth emitted. Creating Auth...')
    global.gAuth = new OAuth(type)
    global.mdb.onlyGetValue('gdrive-token').then((token) => {
      global.gAuth.authorize(token, function (authUrl) {
        if (authUrl) {
          logger.verbose(`Loading authUrl... ${authUrl}`)
          win.loadURL(authUrl, {
            'extraHeaders': 'pragma: no-cache\n'
          })
        } else {
          logger.verbose('As already exists, loading masterpass...')
          win.loadURL(`${global.views.setup}?nav_to=masterpass`)
        }
      })
    })
  })

  win.on('unresponsive', function (event) {
    logger.verbose('addAccountPrompt UNRESPONSIVE')
  })

  webContents.on('did-navigate', function (event, url) {
    logger.verbose(`IPCMAIN: did-navigate emitted URL: ${url}`)
    const regex = /^http:\/\/localhost/g
    if (regex.test(url)) {
      logger.verbose('localhost URL matches')
      win.loadURL(`${global.views.setup}?nav_to=auth`)
      // logger.verbose('MAIN: url matched, sending to RENDER...')
      let err = util.getParam('error', url)
      // if error then callback URL is http://localhost/?error=access_denied#
      // if sucess then callback URL is http://localhost/?code=2bybyu3b2bhbr
      if (!err) {
        let auth_code = util.getParam('code', url)
        logger.verbose(`IPCMAIN: Got the auth_code, ${auth_code}`)
        logger.verbose('IPCMAIN: Calling callback with the code...')
      } else {
        callback(err)
      }
    }
  })
  webContents.on('will-navigate', function (event, url) {
    logger.verbose(`IPCMAIN: will-navigate emitted URL: ${url}`)
  })

  win.on('closed', function () {
    logger.verbose('IPCMAIN: win.closed event emitted for setupWindow.')
    win = null
    callback('ERROR: Cancelled the account adding flow')
  })
}

function Settings (callback) {
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    center: true
  })
  win.loadURL(global.views.settings)
  let webContents = win.webContents
  win.openDevTools()
  // TODO: close app after pass has been reset and vault has been re-encrypted
  ipc.on('resetMasterPass', function (event, type) {
    event.preventDefault()
    logger.verbose('IPCMAIN: resetMasterPass emitted. Creating MasterPassPrompt...')
    MasterPass.Prompt(true)
      .then((MPKset) => {
        webContents.send('resetMasterPassResult', MPKset)
        return
      })
      .catch((err) => {
        webContents.send('resetMasterPassResult', MPKset)
        logger.error(`resetMasterPass err: ${err}`)
      })
  })
  ipc.on('removeAccount', function (event, account) {
    logger.verbose(`IPCMAIN: removeAccount emitted. Creating removing ${account}...`)
  // TODO: IMPLEMENT ACCOUNT REMOVAL ROUTINE
  // if (_.unset(global.accounts, account)) {
  // deleted
  // reload window to update
  // win.loadURL(global.views.settings)
  // TODO: decide whether to do setup is all accounts removed
  // if (Object.keys(global.accounts).length === 0) {
  // 	// Create Setup
  //
  // } else {
  //
  // }
  // } else {
  // not deleted
  // }
  })
  win.on('closed', function () {
    logger.verbose('win.closed event emitted for Settings.')
    win = null
    callback()
  })
}

// TODO: replace with dialog.showErrorBox(title, content) for native dialog?
function ErrorPrompt (err, callback) {
  let win = new BrowserWindow({
    width: 240,
    height: 120,
    center: true,
    titleBarStyle: 'hidden-inset',
    show: true
  })
  let webContents = win.webContents
  let res
  win.loadURL(global.views.errorprompt)
  logger.info(`ERROR PROMPT: the error is ${err}`)
  webContents.on('did-finish-load', function () {
    webContents.send('error', err)
  })

  ipc.on('response', function (event, response) {
    logger.verbose('ERROR PROMPT: Got user response')
    res = response
    win.close()
  })

  win.on('closed', function (response) {
    logger.verbose('win.closed event emitted for ErrPromptWindow.')
    win = null
    if (callback) {
      if (response) {
        callback(res)
      } else {
        callback(null)
      }
    }
  })
}

/**
 * Functions
 **/

/**
 * Event handlers
 **/
// Check for connection status
ipc.on('online-status-changed', function (event, status) {
  logger.verbose(`APP: online-status-changed event emitted changed to ${status}`)
})

app.on('window-all-closed', () => {
  logger.verbose('APP: window-all-closed event emitted')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('quit', () => {
  logger.info('APP: quit event emitted')
})
app.on('will-quit', (event) => {
  if (!exit) {
    event.preventDefault()
    logger.info(`APP.ON('will-quit'): will-quit event emitted`)
    logger.verbose(`platform is ${process.platform}`)
    // TODO: global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client.credentials = global.gAuth.credentials
    global.stats.endTime = moment().format()

    Promise.all([
      global.mdb.saveGlobalObj('accounts'),
      global.mdb.saveGlobalObj('state'),
      global.mdb.saveGlobalObj('settings'),
      global.mdb.saveGlobalObj('files'),
      global.mdb.saveGlobalObj('stats')
    ]).then(function () {
      if (global.MasterPassKey !== undefined && !_.isEmpty(global.vault)) {
        logger.info(`DEFAULT EXIT. global.MasterPassKey and global.vault not empty. Calling crypto.encryptObj...`)
        logger.verbose(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`)

        vault.encrypt(global.MasterPassKey.get())
          .then((tag) => {
            logger.verbose(`crypto.encryptObj invoked...`)
            logger.info(`Encrypted successfully with tag = ${tag.toString('hex')}, saving auth tag and closing mdb...`)
            global.creds.authTag = tag
            global.mdb.saveGlobalObj('creds').then(() => {
              global.mdb.close()
              logger.info('Closed vault and mdb (called mdb.close()).')
              exit = true
              app.quit()
            }).catch((err) => {
              logger.error(`Error while saving global.creds before quit: ${err.stack}`)
            })
          })
          .catch((err) => {
            logger.error(err.stack)
            throw err
          })
      } else {
        logger.info(`NORMAL EXIT. global.MasterPassKey / global.vault empty. Just closing mdb (global.mdb.close())...`)
        global.mdb.close()
        exit = true
        app.quit()
      }
    }, function (reason) {
      logger.error(`PROMISE ERR: ${reason}`)
    }).catch(function (error) {
      logger.error(`PROMISE ERR: ${error.stack}`)
    })
  } else {
    return
  }
})

app.on('activate', function (win) {
  logger.verbose('activate event emitted')
})

/**
 * Main
 **/

app.on('ready', function () {
  // Check synchronously whether paths exist
  let mainRun = ((util.checkDirectorySync(global.paths.mdb)) && (util.checkFileSync(global.paths.vault)))

  // If the MDB or vault does not exist, run setup
  // otherwise run main
  if (mainRun) {
    // Run main
    logger.info('Main run. Creating Menubar...')

    init.main() // Initialise (open mdb and get creds)
      .then(() => {
        return MasterPass.Prompt() // Obtain MP, derive MPK and set globally
      })
      .then(() => {
        return vault.decrypt(global.MasterPassKey.get()) // Decrypt vault with MPK
      })
      .then(() => {
        // restore global state from mdb
        return Promise.all([
          global.mdb.restoreGlobalObj('accounts'),
          global.mdb.restoreGlobalObj('state'),
          global.mdb.restoreGlobalObj('settings'),
          global.mdb.restoreGlobalObj('stats'),
          global.mdb.restoreGlobalObj('files')
        ])
      })
      .then(() => {
        // Initialise Google Drive client
        return init.drive(global.accounts[Object.keys(global.accounts)[0]].oauth.oauth2Client, true)
      })
      .then(() => {
        // Set initial stats
        return init.stats()
      })
      .then(() => {
        // Initial sync worker
        return synker.init()
      })
      .then(() => {
        // TODO: start sync daemon
        // Start menubar
        return Cryptobar(function (result) {
          logger.info(`Cryptobar results: ${result}`)
        })
      })
      .catch(function (error) {
        // Catch any fatal errors and exit
        logger.error(`PROMISE ERR: ${error.stack}`)
        // dialog.showErrorBox('Oops, we encountered a problem...', error.message)
        app.quit()
      })
  } else {
    // Run Setup
    logger.info('Setup run. Creating Setup wizard...')
    init.setup()
      .then(() => {
        return new Promise(function (resolve, reject) {
          Setup(function (err) {
            if (err) {
              logger.error(err)
              reject(err)
            } else {
              logger.info('MAIN Setup successfully completed. quitting...')
              resolve()
            }
          })
        })
      })
      .catch(function (error) {
        logger.error(`PROMISE ERR: ${error.stack}`)
        // dialog.showErrorBox('Oops, we encountered a problem...', error.message)
        app.quit()
      })
  }
})



exports.MasterPassPrompt = function (reset, callback) {
  let tries = 0
  let gotMP = false
  let error = null
  let win = new BrowserWindow({
    width: 300, // 300
    height: 435,
    center: true,
    titleBarStyle: 'hidden-inset'
  // resizable: false,
  })
  let webContents = win.webContents
  if (reset) {
    win.loadURL(`${global.views.masterpassprompt}?nav_to=reset`)
  } else {
    win.loadURL(global.views.masterpassprompt)
  }
  // win.openDevTools()
  ipc.on('checkMasterPass', function (event, masterpass) {
    logger.verbose('IPCMAIN: checkMasterPass emitted. Checking MasterPass...')

    MasterPass.check(masterpass, function (err, match, mpkey) {
      if (err) {
        // send error
        webContents.send('checkMasterPassResult', err)
        error = err
        win.close()
      }
      if (match) {
        logger.info('IPCMAIN: PASSWORD MATCHES!')
        // Now derive masterpasskey and set it (temporarily)
        global.MasterPassKey = new MasterPassKey(mpkey)
        webContents.send('checkMasterPassResult', {
          err: null,
          match: match
        })
        gotMP = true
        setTimeout(function () {
          win.close()
        }, 1000)
      } else {
        logger.warn('IPCMAIN: PASSWORD DOES NOT MATCH!')
        webContents.send('checkMasterPassResult', {
          err: null,
          match: match
        })
        if (++tries >= 3) {
          error = new Error('Limit of three tries exceeded')
          win.close()
        }
      }
    })
  })
  ipc.on('setMasterPass', function (event, masterpass) {
    logger.verbose('IPCMAIN: setMasterPass emitted Setting Masterpass...')
    MasterPass.set(masterpass, function (err, mpkey) {
      if (!err) {
        global.MasterPassKey = new MasterPassKey(mpkey)
        // TODO: test this
        vault.init(global.MasterPassKey.get())
          .then((value) => {
            return global.mdb.saveGlobalObj('creds')
          })
          .catch((err) => {
            error = err
            win.close()
          })
        gotMP = true
        webContents.send('setMasterPassResult', null)
      } else {
        webContents.send('setMasterPassResult', err)
        error = err
        win.close()
      }
    })
  })
  win.on('closed', function () {
    logger.info('win.closed event emitted for MasterPassPrompt')
    callback(error, gotMP)
    win = null
  })

  return win
}
