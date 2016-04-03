'use strict'
/**
 * sync.js
 * Main cloud sync functionality
 ******************************/

let levelup = require('levelup'),
  fs = require('fs-extra'),
  _ = require('lodash'),
  google = require('googleapis'),
  base64 = require('base64-stream'),
  res = require('../static/js/res'),
  https = require('https'),
  moment = require('moment'),
  EventEmitter = require('events').EventEmitter,
  Account = require('./Account'),
  logger = require('../logger'),
  util = require('./util'),
  crypto = require('./crypto'),
  async = require('async')

const API_REQ_LIMIT = 7
const CONCURRENCY = 2
// class SyncEmitter extends EventEmitter {}

// Refer to https://www.googleapis.com/discovery/v1/apis/drive/v3/rest for full request schema

/**
 * Status
 */

exports.event = new EventEmitter()

exports.updateStats = function (file, callback) {
  fs.Stats(file.path, function (err, stats) {
    if (err) {
      logger.verbose(`fs.Stats ERROR: ${err.stack}`)
      return callback(err)
    }
    logger.verbose(`fs.Stats: for ${file.name}, file.mtime = ${stats.mtime}`)
    logger.verbose(`fs.Stats: for ${file.name}, file.size = ${stats.size}`)
    file.mtime = stats.mtime
    file.size = stats.size
    // global.files[file.id] = file
    logger.verbose(`GOT fs.Stat of file, mtime = ${file.mtime}`)
    callback(null, file)
  })
}

exports.updateStatus = function (status, file) {
  return new Promise(function (resolve, reject) {
    if (_.isEqual(status, 'put')) {
      exports.event.emit('put', file)
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
        reject(err)
      }
      // update file globally
      global.files[file.id] = file
      global.state.toUpdate.push(file)
      _.pull(global.state.toCrypt, file)
      logger.info(`DONE ENCRYPTting ${file.name}`)
      resolve(file)
    })
  })
}

exports.pushUpdateQueue = function (file) {
  logger.verbose(`PROMISE: pushUpdateQueue for ${file.name}`)
  return new Promise(function (resolve, reject) {
    exports.updateQueue.push(file, function (err, file) {
      if (err) {
        logger.error(`ERROR occurred while UPDATting`)
        reject()
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
        logger.verbose('Error during download', err)
        callback(err)
      })
      .pipe(dest)
      .on('error', function (err) {
        logger.verbose('Error during writting to fs', err)
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
    let origpath = (parentPath === '/') ? `${global.paths.home}${parentPath}${file.name}` : `${global.paths.home}${parentPath}/${file.name}`
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
    },
  }, function (err, res) {
    if (err) {
      logger.verbose(`callback: error updating ${file.name}`)
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
    fileId: file.id,
    resource: {
      name: `${file.name}.crypto`
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(file.cryptPath)
    },
  }, function (err, rfile) {
    if (err) {
      logger.verbose(`callback: error putting ${file.name}`)
      return callback(err)
    }
    logger.verbose(`callback: put ${file.name}`)
    file.lastSynced = moment().format()
    global.files[rfile.id] = rfile
    callback(null, file, rfile)
  })
}, CONCURRENCY)

/**
 * Promises
 */

exports.genID = function (n = 1) {
  return new Promise(function (resolve, reject) {
    global.drive.files.generateIds({
      count: n,
      space: 'drive'
    }, function (err, res) {
      if (err) {
        logger.verbose(`callback: error genID`)
        return reject(err)
      }
      // logger.verbose(`callback: genID`)
      resolve((res.ids.length === 1) ? res.ids[0] : res.ids)
    })
  })
}

exports.getAccountInfo = function () {
  return new Promise(function (resolve, reject) {
    // logger.verbose('PROMISE: getAccountInfo')
    global.drive.about.get({
      'fields': 'storageQuota,user'
    }, function (err, res) {
      if (err) {
        logger.verbose(`IPCMAIN: drive.about.get, ERR occured, ${err}`)
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
      let fBtree = [],
        folders = [],
        root,
        rfsTree = {}
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
        if (res.files.length == 0) {
          logger.verbose('No files found.')
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
              logger.verbose(`Errpr while mapping folders to file array: ${err}`)
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

exports.setAccountInfo = function (param) {
  logger.verbose('PROMISE: setAccountInfo')
  let profileImgB64 = param[0],
    acc = param[1]
  return new Promise(function (resolve, reject) {
    let accName = `${acc.user.displayName.toLocaleLowerCase().replace(/ /g, '')}_drive`
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
