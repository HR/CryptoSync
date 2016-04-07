'use strict'
/**
 * synker.js (sync worker)
 * The worker for the cloud sync process (spwaned as a child of main process)
 * Ensures the sync process runs uninterruptedly (from main)
 ******************************/
const sync = require('./sync')
const logger = require('../logger')
const _ = require('lodash')
// const async = require('async')
// const moment = require('moment')

exports.init = function () {
  return new Promise(function (resolve, reject) {
    // Set drain (callback) handlers
    exports.initDrains()

    // Restore queues on startup
    if (!_.isEmpty(global.state.toGet)) {
      sync.updateStatus('getting')
      global.state.toGet.forEach(function (file) {
        sync.pushGetQueue(file)
          .then((file) => {
            return sync.pushCryptQueue(file)
          })
          .then((file) => {
            return sync.updateStatus('crypted', file)
          })
          // .then((file) => {
          // 	return sync.pushUpdateQueue(file)
          // })
          // .then(() => {
          // 	return sync.updateStatus('put', file)
          // })
          // .then(() => {
          //   return sync.updateStatus('synced')
          // })
          .catch((err) => {
            sync.updateStatus('notsynced')
            logger.error(`PROMISE ERR: ${err.stack}`)
          })
      })
    }

    if (!_.isEmpty(global.state.toCrypt)) {
      sync.updateStatus('encrypting')
      global.state.toCrypt.forEach(function (file) {
        sync.pushCryptQueue(file)
          .then((file) => {
            return sync.pushUpdateQueue(file)
          })
          .then(() => {
            return sync.updateStatus('put', file)
          })
          .then(() => {
            return sync.updateStatus('synced')
          })
          .catch((err) => {
            sync.updateStatus('notsynced')
            logger.error(`PROMISE ERR: ${err.stack}`)
          })
      })
    }

    // TODO:
    // if (!_.isEmpty(global.state.toUpdate)) {
    //   sync.updateStatus('putting')
    //   global.state.toUpdate.forEach(function (file) {
    //     sync.pushUpdateQueue(file)
    //       .then(() => {
    //         return sync.updateStatus('put', file)
    //       })
    //       .then(() => {
    //         return sync.updateStatus('synced')
    //       })
    //       .catch((err) => {
    //         sync.updateStatus('notsynced')
    //         logger.error(`PROMISE ERR: ${err.stack}`)
    //       })
    //   })
    // }

    if (!_.isEmpty(global.state.toPut)) {
      sync.updateStatus('putting')
      global.state.toPut.forEach(function (file) {
        sync.pushPutQueue(file)
          .then(() => {
            return sync.updateStatus('synced')
          })
          .catch((err) => {
            sync.updateStatus('notsynced')
            logger.error(`PROMISE ERR: ${err.stack}`)
          })
      })
    }
    resolve()
  })
}

exports.initDrains = function () {
  return new Promise(function (resolve, reject) {
    sync.getQueue.drain = function () {
      logger.info('DONE getQueue for ALL items')
    // start encyrpting
    }

    sync.cryptQueue.drain = function () {
      logger.info('DONE cryptQueue for ALL items')
    // start putting
    }

    sync.updateQueue.drain = function () {
      logger.info('DONE updateQueue for ALL items')
    // start taking off toUpdate
    }
    resolve()
  })
}

exports.initWatcher = function () {

}
