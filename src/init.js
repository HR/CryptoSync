'use strict';
/**
 * init.js
 * Initialisers
 ******************************/
const _ = require('lodash'),
	moment = require('moment'),
	google = require('googleapis'),
	logger = require('../logger'),
	util = require('./util'),
	crypto = require('./crypto');


exports.main = function () {
	// Decrypt db (the Vault) and get ready for use
	// open mdb
	return new Promise(function (resolve, reject) {
		global.mdb = new Db(global.paths.mdb);
		global.mdb.get('creds', function (err, json) {
			if (err) {
				if (err.notFound) {
					logger.verbose(`ERROR: key creds NOT FOUND `);
					global.creds = {};
					reject(err);
				} else {
					// I/O or other error, pass it up the callback
					logger.verbose(`ERROR: mdb.get('creds') FAILED`);
					reject(err);
				}
			} else {
				logger.verbose(`SUCCESS: creds FOUND ${json.substr(0, 20)}`);
				global.creds = JSON.parse(json);
				setTimeout(function () {
					logger.verbose(`resolve global.creds called`);
					resolve();
				}, 0);
			}
		});
		fs.ensureDir(global.paths.home, function (err) {
			if (err) reject(err);
			resolve();
		});
	});
};

exports.drive = function (gAuth) {
	// store auth token in mdb
	logger.verbose(`init.drive: `);
	// logger.verbose(require('util').inspect(gAuth, { depth: null }));
	return new Promise(function (resolve, reject) {
		global.drive = google.drive({
			version: 'v3',
			auth: gAuth.oauth2Client
		});
		resolve();
	});
};

exports.syncGlobals = function (trees) {
	return new Promise(function (resolve, reject) {
		logger.verbose(`\n THEN saving file tree (fBtree) to global.state.toGet`);
		global.state = {};
		global.state.toGet = _.flattenDeep(trees[0]);
		global.state.toCrypt = [];
		global.state.toUpdate = [];
		global.state.rfs = trees[1];
		resolve();
	});
};
