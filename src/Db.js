'use strict'
/**
 * Db.js
 * Custom DB (levelup) API implementation
 ******************************/

let levelup = require('levelup'),
  fs = require('fs-extra'),
  _ = require('lodash'),
  logger = require('../logger'),
  crypto = require('./crypto'),
  util = require('util')

function Db (location) {
  // Initialize necessary methods/properties from levelup in this instance
  levelup.call(this, location)
}

// Inherit functions from levelup's prototype
util.inherits(Db, levelup)

Db.prototype.saveGlobalObj = function (objName) {
  const self = this
  // logger.verbose(`PROMISE: saveGlobalObj for ${objName}`)
  return new Promise(function (resolve, reject) {
    if (!(_.isEmpty(global[objName]))) {
      self.put(objName, JSON.stringify(global[objName]), function (err) {
        if (err) {
          logger.verbose(`ERROR: mdb.put('${objName}') failed, ${err}`)
          // I/O or other error, pass it up the callback
          reject(err)
        }
        // logger.verbose(`SUCCESS: mdb.put('${objName}')`)
        resolve()
      })
    } else {
      // logger.verbose('Nothing to save; empty.')
      resolve()
    }
  })
}

Db.prototype.restoreGlobalObj = function (objName) {
  const self = this
  // logger.verbose(`PROMISE: restoreGlobalObj for ${objName}`)
  return new Promise(function (resolve, reject) {
    self.get(objName, function (err, json) {
      if (err) {
        if (err.notFound) {
          logger.verbose(`ERROR: Global obj ${objName} NOT FOUND `)
          reject(err)
        } else {
          // I/O or other error, pass it up the callback
          logger.verbose(`ERROR: mdb.get('${objName}') FAILED`)
          reject(err)
        }
      } else {
        // logger.verbose(`SUCCESS: ${objName} FOUND`)
        try {
          global[objName] = JSON.parse(json) || {}
          resolve()
        } catch (e) {
          return e
        }
      }
    })
  })
}

Db.prototype.onlyGetValue = function (key) {
  const self = this
  logger.verbose(`PROMISE: getValue for getting ${key}`)
  return new Promise(function (resolve, reject) {
    self.get(key, function (err, value) {
      if (err) {
        if (err.notFound) {
          logger.verbose(`ERROR: key ${key} NOT FOUND `)
          resolve(null)
        } else {
          // I/O or other error, pass it up the callback
          logger.verbose(`ERROR: mdb.get('${key}') FAILED`)
          reject(err)
        }
      } else {
        logger.verbose(`SUCCESS: ${key} FOUND`)
        resolve(value)
      }
    })
  })
}

Db.prototype.getValue = function (key) {
  const self = this
  logger.verbose(`PROMISE: getValue for getting ${key}`)
  return new Promise(function (resolve, reject) {
    self.get(key, function (err, value) {
      if (err) {
        if (err.notFound) {
          resolve(null)
        } else {
          // I/O or other error, pass it up the callback
          logger.verbose(`ERROR: mdb.get('${key}') FAILED`)
          reject(err)
        }
      } else {
        logger.verbose(`SUCCESS: ${key} FOUND`)
        resolve(value)
      }
    })
  })
}

Db.prototype.storeToken = function (token) {
  const self = this
  return new Promise(function (resolve, reject) {
    self.put(`gdrive-token`, JSON.stringify(token), function (err) {
      if (err) reject(err) // some kind of I/O error
      logger.verbose(`Token stored in mdb`)
      resolve()
    })
  })
}

module.exports = Db
