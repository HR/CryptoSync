const sync = require('./sync')
const logger = require('../logger')
const chokidar = require('chokidar')
const dotRegex = /\/\..+/g
const fNameRegex = /[^/]+[A-z0-9]+\.[A-z0-9]+/g

const watcher = chokidar.watch(global.paths.home, {
  ignored: dotRegex,
  persistent: true,
  ignoreInitial: true,
  alwaysStat: true
})

let createFileObj = function (fileId, fileName, path) {
  return new Promise(function (resolve, reject) {
    let file = {}
    file.name = fileName
    file.id = fileId
    file.path = path
    global.files[file.id] = file
    resolve(file)
  })
}

watcher.on('add', (path, stats) => {
  if (dotRegex.test(path)) {
    // Ignore dot file
    logger.info(`IGNORE added file ${path}, stats.mtime = ${stats.mtime}`)
    watcher.unwatch(path)
  } else {
    // Queue up to encrypt and put
    let fileName = path.match(fNameRegex)[0]
    // let relPath = path.replace(global.paths.home, '')
    logger.info(`ADD added file ${fileName}, stats ${stats.mtime}`)

    sync.genID()
      .then((fileId) => {
        return createFileObj(fileId, fileName, path)
      })
      .then((file) => {
        return sync.pushCryptQueue(file)
      })
      .then((file) => {
        return sync.pushPutQueue(file)
      })
      .then((file) => {
        logger.info(`Done encrypting ${file.name} (${file.id})`)
      })
      .catch((err) => {
        logger.error(`Error occured while adding ${fileName}:
${err.stack}`)
      })
  }
})

watcher
  .on('change', (path, stats) => {
    if (dotRegex.test(path)) {
      // Ignore dot file
      logger.info(`IGNORE added file ${path}, stats ${stats.mtime}`)
      watcher.unwatch(path)
    } else {
      // Queue up to encrypt and put
      let fileName = path.match(fNameRegex)[0]
      logger.info(`File ${fileName} at ${path} has been changed, stats ${stats.mtime}}`)
    }
  })
  .on('unlink', (path, stats) => logger.info(`File ${path} has been removed, stats ${stats}`))
  .on('addDir', (path, stats) => logger.info(`Directory ${path} has been added, stats ${stats}`))
  .on('unlinkDir', (path, stats) => logger.info(`Directory ${path} has been removed, stats ${stats}`))
  .on('error', error => logger.error(`Watcher error: ${error}`))
  .on('ready', () => {
    logger.info('Initial scan complete. Ready for changes')
  })
  // .on('raw', (event, path, details) => {
  // 	logger.verbose('Raw event info:', event, path, details)
  // })
  //
