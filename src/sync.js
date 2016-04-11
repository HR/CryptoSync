'use strict'
/**
 * sync.js
 * Main cloud sync functionality
 ******************************/

const fs = require('fs-extra')
const _ = require('lodash')
const base64 = require('base64-stream')
const res = require('../res/res')
const https = require('https')
const moment = require('moment')
const EventEmitter = require('events').EventEmitter
const Account = require('./Account')
const logger = require('../script/logger')
const util = require('./util')
const crypto = require('./crypto')
const async = require('async')

const CONCURRENCY = 2
// class SyncEmitter extends EventEmitter {}

// Refer to https://www.googleapis.com/discovery/v1/apis/drive/v3/rest for full request schema

/**
 * Status
 */

exports.event = new EventEmitter()

exports.updateStats = function (file) {
  return new Promise(function (resolve, reject) {
    fs.stat(file.path, function (err, stats) {
      if (err) reject(err)
      logger.verbose(`fs.stat: for ${file.name}, file.mtime = ${stats.mtime}, file.size = ${stats.size}`)
      file.mtime = stats.mtime
      file.size = stats.size
      resolve(file)
    })
  })
}

exports.updateHash = function (file) {
  return new Promise(function (resolve, reject) {
    crypto.genFileHash(file.path)
      .then((md5hash) => {
        file.md5hash = md5hash
        return resolve(file)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

exports.updateStatus = function (status, file = null) {
  return new Promise(function (resolve, reject) {
    if (file) {
      exports.event.emit(status, file)
    } else {
      exports.event.emit('statusChange', status)
    }
    resolve()
  })
}

/**
 * Promise Queues
 */
// first global.state.toGet.push(file)
// then enqueue

exports.pushGetQueue = function (file) {
  logger.verbose(`PROMISE: pushGetQueue for ${file.name}`)
  return new Promise(function (resolve, reject) {
    exports.getQueue.push(file, function (err, file) {
      if (err) {
        logger.error(`ERROR occurred while GETting ${file.name}`)
        reject(err)
      }
      // update file globally
      global.files[file.id] = file
      global.state.toCrypt.push(file) // add from toCrypt queue
      _.pull(global.state.toGet, file) // remove from toGet queue
      logger.info(`DONE GETting ${file.name}`)
      resolve(file)
    })
  })
}

exports.pushCryptQueue = function (file) {
  logger.verbose(`PROMISE: pushCryptQueue for ${file.name}`)
  return new Promise(function (resolve, reject) {
    exports.cryptQueue.push(file, function (err, file) {
      if (err) {
        logger.error(`ERROR occurred while ENCRYPTting`)
        return reject(err)
      }
      // update file globally
      if (_.has(file, 'id')) {
        // file to update
        global.files[file.id] = file
        global.state.toUpdate.push(file)
        _.pull(global.state.toCrypt, file)
      } else {
        // added file to put
        global.state.toPut.push(file)
        _.pull(global.state.toCrypt, file)
      }
      logger.info(`DONE ENCRYPTting ${file.name}`)
      resolve(file)
    })
  })
}

// TODO: Implement rename OP
exports.pushUpdateQueue = function (file) {
  logger.verbose(`PROMISE: pushUpdateQueue for ${file.name}`)
  return new Promise(function (resolve, reject) {
    exports.updateQueue.push(file, function (err, file) {
      if (err) {
        logger.error(`ERROR occurred while UPDATting`)
        reject(err)
      }
      // update file globally
      global.files[file.id] = file
      // remove file from persistent update queue
      _.pull(global.state.toUpdate, file)
      logger.info(`DONE UPDATting ${file.name}. Removing from global status...`)
      resolve()
    })
  })
}

exports.pushPutQueue = function (file) {
  logger.verbose(`PROMISE: pushPutQueue for ${file.name}`)
  return new Promise(function (resolve, reject) {
    exports.putQueue.push(file, function (err, file, rfile) {
      if (err) {
        logger.error(`ERROR occurred while UPDATting`)
        reject(err)
      }
      // update file globally
      file.id = rfile.id
      global.files[rfile.id] = file

      // remove file from persistent update queue
      _.pull(global.state.toPut, file)
      logger.info(`DONE UPDATting ${file.name}. Removing from global status...`)
      resolve(rfile)
    })
  })
}

/**
 * Async Queues
 */

exports.getQueue = async.queue(function (file, callback) {
  if (!file || _.isEmpty(file)) callback(new Error("File doesn't exist"))
  let parentPath = global.state.rfs[file.parents[0]].path
  const dir = `${global.paths.home}${parentPath}`
  const path = (parentPath === '/') ? `${dir}${file.name}` : `${dir}/${file.name}`
  file.path = path

  fs.mkdirs(dir, function (err) {
    if (err) callback(err)
    // logger.verbose(`GETing ${file.name} at dest ${path}`)
    let dest = fs.createWriteStream(path)

    global.drive.files.get({
      fileId: file.id,
      alt: 'media'
    })
      .on('error', function (err) {
        logger.error('Error during download', err)
        callback(err)
      })
      .pipe(dest)
      .on('error', function (err) {
        logger.error('Error during writting to fs', err)
        callback(err)
      })
      .on('finish', function () {
        // logger.verbose(`Written ${file.name} to ${path}`)
        // exports.event.emit('got', file)
        callback(null, file)
      })
  })
}, CONCURRENCY)

exports.cryptQueue = async.queue(function (file, callback) {
  fs.mkdirs(global.paths.crypted, function (err) {
    if (err) return callback(err)
    let parentPath = global.state.rfs[file.parents[0]].path
    // let parentPath = (_.has(file, parents)) ? global.state.rfs[file.parents[0]].path : file.parentPath
    // TODO: look into using path module
    let origpath = file.path
    let destpath = `${global.paths.crypted}/${file.name}.crypto`
    // logger.verbose(`TO ENCRYTPT: ${file.name} (${file.id}) at origpath: ${origpath} to destpath: ${destpath} with parentPath ${parentPath}`)
    crypto.encrypt(origpath, destpath, global.MasterPassKey.get(), function (err, key, iv, tag) {
      if (err) {
        return callback(err)
      } else {
        try {
          global.vault.files = global.vault.files || {}
          file.cryptPath = destpath
          file.iv = iv.toString('hex')
          file.authTag = tag.toString('hex')
          file.lastCrypted = moment().format()
          global.vault.files[file.id] = _.cloneDeep(file)
          global.vault.files[file.id].shares = crypto.pass2shares(key.toString('hex'))
          callback(null, file)
        } catch (err) {
          callback(err)
        }
      }
    })
  })
}, CONCURRENCY)

exports.updateQueue = async.queue(function (file, callback) {
  logger.verbose(`TO UPDATE: ${file.name} (${file.id})`)
  global.drive.files.update({
    fileId: file.id,
    resource: {
      name: `${file.name}.crypto`
    },
    contentHints: {
      thumbnail: {
        image: res.thumbnail,
        mimeType: 'image/png'
      }
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(file.cryptPath)
    }
  }, function (err, res) {
    if (err) {
      logger.error(`callback: error updating ${file.name}`)
      return callback(err)
    }
    logger.verbose(`callback: update ${file.name}`)
    file.lastSynced = moment().format()
    callback(null, file)
  })
}, CONCURRENCY)

exports.putQueue = async.queue(function (file, callback) {
  logger.verbose(`TO PUT: ${file.name} (${file.id})`)
  global.drive.files.create({
    resource: {
      name: `${file.name}.crypto`
    },
    contentHints: {
      thumbnail: {
        image: res.urlsafe_thumb,
        mimeType: 'image/png'
      }
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(file.cryptPath)
    }
  }, function (err, rfile) {
    if (err) {
      logger.error(`callback: error putting ${file.name}`)
      return callback(err)
    }
    logger.verbose(`callback: put ${file.name}`)
    file.lastSynced = moment().format()
    file.id = rfile.id
    callback(null, file)
  })
}, CONCURRENCY)

/**
 * Promises
 */

exports.createFileObj = function (fileName, path, parents) {
  return new Promise(function (resolve, reject) {
    let file = {}
    file.name = fileName
    file.path = path
    file.parents = parents
    resolve(file)
  })
}

exports.getAccountInfo = function () {
  return new Promise(function (resolve, reject) {
    // logger.verbose('PROMISE: getAccountInfo')
    global.drive.about.get({
      'fields': 'storageQuota,user'
    }, function (err, res) {
      if (err) {
        logger.error(`IPCMAIN: drive.about.get, ERR occured, ${err}`)
        reject(err)
      } else {
        // logger.verbose(`IPCMAIN: drive.about.get, RES:`)
        // logger.verbose(`\nemail: ${res.user.emailAddress}\nname: ${res.user.displayName}\nimage:${res.user.photoLink}\n`)
        // get the account photo and convert to base64
        resolve(res)
      }
    })
  })
}

exports.getAllFiles = function (email) {
  // get all drive files and start downloading them
  logger.verbose(`PROMISE for retrieving all of ${email} files`)
  return new Promise(
    function (resolve, reject) {
      let fBtree = []
      let folders = []
      let rfsTree = {}
      let root
      // TODO: Implement Btree for file directory structure
      logger.verbose('PROMISE: getAllFiles')
      logger.verbose(`query is going to be >> 'root' in parents and trashed = false`)
      global.drive.files.list({
        q: `'root' in parents and trashed = false`,
        orderBy: 'folder desc',
        fields: 'files(fullFileExtension,id,md5Checksum,mimeType,name,ownedByMe,parents,properties,webContentLink,webViewLink),nextPageToken',
        spaces: 'drive',
        pageSize: 1000
      }, function (err, res) {
        if (err) {
          reject(err)
        }
        if (res.files.length === 0) {
          logger.warn('No files found.')
          reject(new Error('No files found'))
        } else {
          logger.verbose('Google Drive files (depth 2):')
          root = res.files[0].parents[0]
          rfsTree[root] = {}
          rfsTree[root]['path'] = `/`

          for (let i = 0; i < res.files.length; i++) {
            let file = res.files[i]
            if (_.isEqual('application/vnd.google-apps.folder', file.mimeType)) {
              logger.verbose(`Folder ${file.name} found. Calling fetchFolderItems...`)
              folders.push(file.id)
              rfsTree[file.id] = file
              rfsTree[file.id]['path'] = `${rfsTree[file.parents[0]]['path']}${file.name}`
            } else {
              logger.verbose(`root/${file.name} (${file.id})`)
              global.files[file.id] = file
              fBtree.push(file)
            }
          }
          // TODO: map folderIds to their respective files & append to the toGet arr
          async.map(folders, exports.fetchFolderItems, function (err, fsuBtree) {
            logger.verbose(`Got ids: ${folders}. Calling async.map(folders, fetchFolderItem,...) to map`)
            if (err) {
              logger.error(`Errpr while mapping folders to file array: ${err}`)
              reject(err)
            } else {
              // logger.verbose(`Post-callback ${sutil.inspect(fsuBtree)}`)
              fBtree.push(_.flattenDeep(fsuBtree))
              logger.verbose(`Got fsuBtree: ${fsuBtree}`)
              resolve([fBtree, rfsTree])
            }
          })
        // TODO: FIX ASYNC issue >> .then invoked before fetchFolderItems finishes entirely (due to else clause always met
        }
      })
    }
  )
}

exports.getPhoto = function (res) {
  logger.verbose('PROMISE: getPhoto')
  return new Promise(
    function (resolve, reject) {
      https.get(res.user.photoLink, function (pfres) {
        if (pfres.statusCode === 200) {
          let stream = pfres.pipe(base64.encode())
          util.streamToString(stream, (err, profileImgB64) => {
            if (err) reject(err)
            logger.verbose(`SUCCESS: https.get(res.user.photoLink) retrieved res.user.photoLink and converted into ${profileImgB64.substr(0, 20)}...`)
            // Now set the account info
            resolve([profileImgB64, res])
          })
        } else {
          reject(new Error(`ERROR: https.get(res.user.photoLink) failed to retrieve res.user.photoLink, pfres code is ${pfres.statusCode}`))
        }
      })
    }
  )
}

exports.setAccountInfo = function (param, gAuth) {
  logger.verbose('PROMISE: setAccountInfo')
  const profileImgB64 = param[0]
  const acc = param[1]
  return new Promise(function (resolve, reject) {
    const accName = `${acc.user.displayName.toLocaleLowerCase().replace(/ /g, '')}_drive`
    logger.verbose(`Accounts object key, accName = ${accName}`)
    // Add account to global acc obj
    global.accounts[accName] = new Account('gdrive', acc.user.displayName, acc.user.emailAddress, profileImgB64, {
      'limit': acc.storageQuota.limit,
      'usage': acc.storageQuota.usage,
      'usageInDrive': acc.storageQuota.usageInDrive,
      'usageInDriveTrash': acc.storageQuota.usageInDriveTrash
    }, gAuth)
    resolve(acc.user.emailAddress)
  })
}

// TODO: Implement recursive function
exports.fetchFolderItems = function (folderId, callback) {
  let fsuBtree = []
  //
  global.drive.files.list({
    q: `'${folderId}' in parents`,
    orderBy: 'folder desc',
    fields: 'files(name,id,fullFileExtension,mimeType,md5Checksum,ownedByMe,parents,properties,webContentLink,webViewLink),nextPageToken',
    spaces: 'drive',
    pageSize: 1000
  }, function (err, res) {
    if (err) {
      callback(err, null)
    } else {
      // if (res.nextPageToken) {
      // 	logger.verbose("Page token", res.nextPageToken)
      // 	pageFn(res.nextPageToken, pageFn, callback(null, res.files))
      // }
      // if (recursive) {
      // 	logger.verbose('Recursive fetch...')
      // 	for (var i = 0; i < res.files.length; i++) {
      // 		let file = res.files[i]
      // 		if (_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
      // 			logger.verbose('Iteration folder: ', file.name, file.id)
      // 			exports.fetchFolderItems(file, true, callback, fsuBtree)
      // 			if (res.files.length === i) {
      // 				// return the retrieved file list (fsuBtree) to callee
      // 				return exports.fetchFolderItems(file, true, callback, fsuBtree)
      // 			}
      // 		} else {
      // 			fsuBtree[file.id] = file
      // 		}
      // 	}
      // } else { // do one Iteration and ignore folders}
      for (var i = 0; i < res.files.length; i++) {
        let file = res.files[i]
        if (!_.isEqual('application/vnd.google-apps.folder', file.mimeType)) {
          logger.verbose(`root/${folderId}/  ${file.name} ${file.id}`)
          global.files[file.id] = file
          fsuBtree.push(file)
        }
      }
      callback(null, fsuBtree)
    }
  })
}
