'use strict'
/**
 * crypto.js
 * Provides the crypto functionality required
 ******************************/

const secrets = require('secrets.js')
const fs = require('fs-extra')
const util = require('./util')
const logger = require('../script/logger')
const _ = require('lodash')
const Readable = require('stream').Readable
const crypto = require('crypto')

// Crypto default constants
// TODO: change accordingly when changed in settings
let defaults = {
  iterations: 5000, // file encryption key iterations
  keyLength: 32, // 32 bytes
  ivLength: 12,
  algorithm: 'aes-256-gcm',
  salgorithm: 'aes-256-ctr',
  digest: 'sha256',
  hash_alg: 'sha256',
  check_hash_alg: 'md5',
  padLength: 1024, // 1 MB
  mpk_iterations: 100000, // masterpass key iterations
  shares: 3,
  threshold: 2
}

/*	Crypto
 *
 *	TODO:
 *	- Implement bitcoin blockchain as source of randomness (in iv generation)
 *  - rewrite as promises
 */

exports.encrypt = function (origpath, destpath, mpkey, callback) {
  // decrypts any arbitrary data passed with the pass
  let pass = (Array.isArray(mpkey)) ? exports.shares2pass(mpkey) : mpkey
  // pass = password
  const salt = crypto.randomBytes(defaults.keyLength) // generate pseudorandom salt
  crypto.pbkdf2(pass, salt, defaults.iterations, defaults.keyLength, defaults.digest, (err, key) => {
    if (err) {
      // return error to callback YOLO#101
      callback(err)
    }
      // logger.verbose(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`)
      const origin = fs.createReadStream(origpath)
      const dest = fs.createWriteStream(destpath)
      const iv = crypto.randomBytes(defaults.ivLength) // generate pseudorandom iv
      const cipher = crypto.createCipheriv(defaults.algorithm, key, iv)

      origin.pipe(cipher).pipe(dest, {
        end: false
      })

      cipher.on('error', () => {
        logger.verbose(`CIPHER STREAM: Error while encrypting file`)
        callback(err)
      })

      origin.on('error', () => {
        logger.verbose(`ORIGIN STREAM: Error while reading file to ${destpath}`)
        callback(err)
      })

      dest.on('error', () => {
        logger.verbose(`DEST STREAM: Error while writting file to ${destpath}`)
        callback(err)
      })

      origin.on('end', () => {
        // Append iv used to encrypt the file to end of file
        dest.write(`CryptoSync#${iv.toString('hex')}#${cipher.getAuthTag().toString('hex')}`)
        dest.end()
      // logger.verbose(`End (of writestream) for ${destf} called, IV&authTag appended`)
      })

      dest.on('finish', () => {
        const tag = cipher.getAuthTag()
        // logger.verbose(`Finished encrypted/written to ${destf}`)
        callback(null, key, iv, tag)
      })

  })
}

exports.encryptObj = function (obj, destpath, mpkey, viv, callback) {
  // decrypts any arbitrary data passed with the pass
  // pass = (Array.isArray(password)) ? shares2pass(password) : password,

  const iv = (viv instanceof Buffer) ? viv : new Buffer(viv.data)
  const origin = new Readable()
  try {
    const json = JSON.stringify(obj)
    origin.push(json) // writes the json string of obj to stream
    origin.push(null) // indicates end-of-file basically - the end of the stream
  } catch (err) {
    logger.verbose(`JSON.stringify error for ${destpath}`)
    callback(err)
  }
  const dest = fs.createWriteStream(destpath)
  const cipher = crypto.createCipheriv(defaults.algorithm, mpkey, iv)

  origin.on('error', function (e) {
    callback(e)
  })
  .pipe(cipher).on('error', function (e) {
    callback(e)
  })
  .pipe(dest).on('error', function (e) {
    callback(e)
  })

  dest.on('finish', () => {
    const tag = cipher.getAuthTag()
    // logger.verbose(`Finished encrypted/written to ${destpath} with authtag = ${tag.toString('hex')}`)
    callback(null, tag)
  })
}

exports.genIV = function () {
  return new Promise(function (resolve, reject) {
    try {
      const iv = crypto.randomBytes(defaults.ivLength) // Synchronous gen
      resolve(iv)
    } catch (err) {
      reject(err)
    }
  })
}

exports.deriveMasterPassKey = function (masterpass, mpsalt, callback) {
  if (!masterpass) return callback(new Error('MasterPassKey not provided'))
  const salt = (mpsalt) ? ((mpsalt instanceof Buffer) ? mpsalt : new Buffer(mpsalt.data)) : crypto.randomBytes(defaults.keyLength)
  crypto.pbkdf2(masterpass, salt, defaults.mpk_iterations, defaults.keyLength, defaults.digest, (err, mpkey) => {
    if (err) {
      // return error to callback
      return callback(err)
    } else {
      // logger.verbose(`Pbkdf2 generated: \nmpkey = ${mpkey.toString('hex')} \nwith salt = ${salt.toString('hex')}`)
      return callback(null, mpkey, salt)
    }
  })
}

exports.genPassHash = function (mpass, salt, callback) {
  // logger.verbose(`crypto.genPassHash() invoked`)
  const pass = (mpass instanceof Buffer) ? mpass.toString('hex') : mpass

  if (salt) {
    const hash = crypto.createHash(defaults.hash_alg).update(`${pass}${salt}`).digest('hex')
    // logger.verbose(`genPassHash: S, pass = ${pass}, salt = ${salt}, hash = ${hash}`)
    callback(hash)
  } else {
    const salt = crypto.randomBytes(defaults.keyLength).toString('hex')
    const hash = crypto.createHash(defaults.hash_alg).update(`${pass}${salt}`).digest('hex')
    // logger.verbose(`genPassHash: NS, pass = ${pass}, salt = ${salt}, hash = ${hash}`)
    callback(hash, salt)
  }
}

exports.verifyPassHash = function (mpkhash, gmpkhash) {
  return _.isEqual(mpkhash, gmpkhash)
}

exports.genFileHash = function (origpath, callback) {
  return new Promise(function (resolve, reject) {
    let fd = fs.createReadStream(origpath)
    const hash = crypto.createHash(defaults.check_hash_alg)
    hash.setEncoding('hex')
    fd.on('end', function () {
      hash.end()
      const fhash = hash.read()
      logger.verbose(`genFileHash: fhash = ${fhash} for ${origpath}`)
      resolve(fhash)
    })

    fd.on('error', function (e) {
      reject(e)
    }).pipe(hash).on('error', function (e) {
      reject(e)
    })
  })
}

exports.verifyFileHash = function (fhash, gfhash) {
  return _.isEqual(fhash, gfhash)
}

exports.decrypt = function (origpath, destpath, key, iv, authTag, callback) {
  // encrypts any arbitrary data passed with the pass
  // const pass = (Array.isArray(key)) ? shares2pass(key) : key
  if (!authTag || !iv) {
    // extract from last line of file
    fs.readFile(origpath, 'utf-8', function (err, data) {
      if (err) callback(err)

      let lines = data.trim().split('\n')
      let lastLine = lines.slice(-1)[0]
      let fields = lastLine.split('#')
      if (_.isEqual(fields[0], 'CryptoSync')) {
        const iv = new Buffer(fields[1], 'hex')
        const authTag = new Buffer(fields[2], 'hex')
        const mainData = lines.slice(0, -1).join()
        let origin = new Readable()
        // read as stream
        origin.push(mainData)
        origin.push(null)

        const decipher = crypto.createDecipheriv(defaults.algorithm, key, iv)
        decipher.setAuthTag(authTag)
        const dest = fs.createWriteStream(destpath)

        origin.pipe(decipher).pipe(dest)

        decipher.on('error', () => {
          callback(err)
        })

        origin.on('error', () => {
          callback(err)
        })

        dest.on('error', () => {
          callback(err)
        })

        dest.on('finish', () => {
          logger.verbose(`Finished encrypted/written to ${destpath}`)
          callback(null, iv)
        })
      } else {
        callback(new Error('IV and authTag not supplied'))
      }
    })
  } else {
    // TODO: Implement normal flow
  }
}

exports.pass2shares = function (pass, total = defaults.shares, th = defaults.threshold) {
  // splits the pass into shares using Shamir's Secret Sharing
  // convert the text into a hex string
  try {
    // pass = secrets.str2hex(pass)
    // split into N shares, with a threshold of th
    // Zero padding of defaults.padLength applied to ensure minimal info leak (i.e size of pass)
    const shares = secrets.share(pass, total, th, defaults.padLength)
    const sharesd = {
      data: shares,
      total: total,
      threshold: th
    }
    return sharesd
  } catch (err) {
    throw err
  }
}

/**
 * @param {array} of at least the threshold length
 */
exports.shares2pass = function (sharesd) {
  // reconstructs the pass from the shares of the pass
  // using Shamir's Secret Sharing
  // let S = sharedata[2],
  // let N = sharedata[1]
  try {
    // Extract the shares
    const shares = (_.isArray(sharesd)) ? sharesd : sharesd.data
    const pass = secrets.combine(shares)
    // convert back to str
    const hpass = (pass).toString('hex')
    return hpass
  } catch (err) {
    throw err
  }
}
