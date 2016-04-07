'use strict'
/**
 * init.js
 * Initialisers
 ******************************/
const _ = require('lodash')
const moment = require('moment')
const fs = require('fs-extra')
const google = require('googleapis')
const logger = require('../logger')
const Db = require('./Db')

exports.main = function () {
  // Decrypt db (the Vault) and get ready for use
  // open mdb
  logger.verbose(`PROMISE: Main initialisation`)
  return new Promise(function (resolve, reject) {
    global.mdb = new Db(global.paths.mdb)
    global.mdb.get('creds', function (err, json) {
      if (err) {
        if (err.notFound) {
          logger.error(`ERROR: key creds NOT FOUND `)
          global.creds = {}
          reject(err)
        } else {
          // I/O or other error, pass it up the callback
          logger.error(`ERROR: mdb.get('creds') FAILED`)
          reject(err)
        }
      } else {
        logger.info(`SUCCESS: creds FOUND ${json.substr(0, 20)}`)
        global.creds = JSON.parse(json)
        setTimeout(function () {
          logger.verbose(`resolve global.creds called`)
          resolve()
        }, 0)
      }
    })
    fs.ensureDir(global.paths.home, function (err) {
      if (err) reject(err)
      resolve()
    })
  })
}

exports.setup = function () {
  logger.verbose(`PROMISE: Setup initialisation`)
  return new Promise(function (resolve, reject) {
    global.mdb = new Db(global.paths.mdb)
    fs.ensureDir(global.paths.home, function (err) {
      if (err) reject(err)
      resolve()
    })
  })
}

exports.drive = function (gAuth, notInstOfAuth) {
  // store auth token in mdb
  logger.verbose(`init.drive: `)
  // logger.verbose(require('util').inspect(gAuth, { depth: null }))
  return new Promise(function (resolve, reject) {
    if (notInstOfAuth) {
      const initedGAuth = new google.auth.OAuth2(gAuth.clientId_, gAuth.clientSecret_, gAuth.redirectUri_)
      initedGAuth.setCredentials(gAuth.credentials)
      global.drive = google.drive({
        version: 'v3',
        auth: initedGAuth
      })
      resolve()
    } else {
      global.drive = google.drive({
        version: 'v3',
        auth: gAuth.oauth2Client
      })
      resolve()
    }
  })
}

exports.stats = function () {
  return new Promise(function (resolve, reject) {
    global.stats.startTime = moment().format()
    global.stats.time = moment()
    resolve()
  })
}

exports.syncGlobals = function (trees) {
  return new Promise(function (resolve, reject) {
    logger.verbose(`Saving file tree (fBtree) to global.state.toGet`)
    global.state = {}
    global.state.toGet = _.flattenDeep(trees[0])
    global.state.toCrypt = []
    global.state.toUpdate = []
    global.state.recents = []
    global.state.rfs = trees[1]
    resolve()
  })
}
