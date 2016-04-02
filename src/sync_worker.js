'use strict';
/**
 * sync_worker.js
 * The worker for the cloud sync process (spwaned as a child of main process)
 * Ensures the sync process runs uninterruptedly (from main)
 ******************************/
const sync = require('./src/sync'),
	ipc = electron.ipcMain,
	moment = require('moment'),
	fs = require('fs-extra'),
	logger = require('../logger'),
	_ = require('lodash'),
	async = require('async');
