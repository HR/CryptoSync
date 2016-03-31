'use strict';
/**
 * init.js
 * Initialisers
 ******************************/
const _ = require('lodash'),
	moment = require('./moment'),
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
					console.log(`ERROR: key creds NOT FOUND `);
					global.creds = {};
					reject(err);
				} else {
					// I/O or other error, pass it up the callback
					console.log(`ERROR: mdb.get('creds') FAILED`);
					reject(err);
				}
			} else {
				console.log(`SUCCESS: creds FOUND ${json.substr(0, 20)}`);
				global.creds = JSON.parse(json);
				setTimeout(function () {
					console.log(`resolve global.creds called`);
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

exports.vault = function (callback) {
	console.log(`initVault invoked. Creating global vault obj & encrypting...`);
	global.vault = {};
	global.vault.creationDate = moment().format();
	// TODO: decide whether to use crypto.encryptObj or genIvSalt (and then encryptObj
	// & remove gen functionality from crypto.encryptObj)
	crypto.genIv(function (err, iv, salt) {
		console.log(`crypto.genIvSalt callback.`);
		if (err) {
			callback(err);
		} else {
			global.creds.viv = iv;
			console.log(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`);
			crypto.encryptObj(global.vault, global.paths.vault, global.MasterPassKey.get(), global.creds.viv, function (err, tag) {
				console.log(`crypto.encryptObj callback.`);
				if (err) {
					callback(err);
				} else {
					console.log(`Encrypted successfully with tag = ${tag.toString('hex')}`);
					global.creds.authTag = tag;
					callback(null);
				}
			});
		}
	});
};

exports.drive = function (gAuth) {
	// store auth token in mdb
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
		console.log(`\n THEN saving file tree (fBtree) to global.state.toGet`);
		global.state = {};
		global.state.toGet = _.flattenDeep(trees[0]);
		global.state.toCrypt = [];
		global.state.toUpdate = [];
		global.state.rfs = trees[1];
	});
};
