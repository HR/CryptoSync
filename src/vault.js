'use strict'
/**
 * Vault.js
 * Vault functionality
 ******************************/
const moment = require('moment')
const sutil = require('util')
const logger = require('../script/logger')
const crypto = require('./crypto')

// function Vault(crypted, path, viv, data) {
// 	this.crypted = encrypted
// 	this.path = path
// 	this.viv = viv
// 	this.data = data
// }

exports.init = function (mpkey) {
  return new Promise(function (resolve, reject) {
    logger.verbose(`Vault.init invoked. Creating global vault obj & encrypting...`)
    crypto.genIV()
      .then(function (iv) {
        // logger.verbose(`crypto.genIvSalt callback.`)
        global.vault = {}
        global.vault.files = {}
        global.vault.creationDate = moment().format()
        global.creds.viv = iv
      // logger.verbose(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`)
      })
      .then(() => {
        return exports.encrypt(mpkey)
      })
      .then(() => {
        resolve()
      })
      .catch((err) => {
        reject(err)
      })
  })
}

exports.decrypt = function (mpkey) {
  return new Promise(function (resolve, reject) {
    if (!mpkey) reject(new Error('No MasterPassKey passed'))
    crypto.decryptObj(global.paths.vault, mpkey, global.creds.viv, global.creds.authTag, function (err, vault) {
      if (err) {
        logger.error(`decryptObj ERR: ${err.stack}`)
        reject(err)
      } else {
        global.vault = vault
        logger.verbose(`Decrypted vault, vault's content is ${sutil.inspect(vault).substr(0, 30)}`)
        resolve()
      }
    })
  })
}

exports.encrypt = function (mpkey) {
  return new Promise(function (resolve, reject) {
    crypto.encryptObj(global.vault, global.paths.vault, mpkey, global.creds.viv, function (err, tag) {
      logger.verbose(`crypto.encryptObj invoked...`)
      if (err) {
        reject(err)
      } else {
        // logger.verbose(`Encrypted successfully with tag = ${tag.toString('hex')}, saving auth tag and closing mdb...`)
        global.creds.authTag = tag
        resolve(tag)
      }
    })
  })
}
