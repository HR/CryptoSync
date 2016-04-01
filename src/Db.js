'use strict';
/**
 * Db.js
 * Custom DB (levelup) API implementation
 ******************************/

let levelup = require('levelup'),
	fs = require('fs-extra'),
	_ = require('lodash'),
	crypto = require('./crypto'),
	util = require('util');


function Db(location) {
	// Initialize necessary methods/properties from levelup in this instance
	levelup.call(this, location);
}

// Inherit functions from levelup's prototype
util.inherits(Db, levelup);


Db.prototype.saveGlobalObj = function (objName) {
	const self = this;
	// console.log(`PROMISE: saveGlobalObj for ${objName}`);
	return new Promise(function (resolve, reject) {
		if (!(_.isEmpty(global[objName]))) {
			self.put(objName, JSON.stringify(global[objName]), function (err) {
				if (err) {
					console.log(`ERROR: mdb.put('${objName}') failed, ${err}`);
					// I/O or other error, pass it up the callback
					reject(err);
				}
				// console.log(`SUCCESS: mdb.put('${objName}')`);
				resolve();
			});
		} else {
			// console.log('Nothing to save; empty.');
			resolve();
		}
	});
};

Db.prototype.restoreGlobalObj = function (objName) {
	const self = this;
	// console.log(`PROMISE: restoreGlobalObj for ${objName}`);
	return new Promise(function (resolve, reject) {
		self.get(objName, function (err, json) {
			if (err) {
				if (err.notFound) {
					console.log(`ERROR: Global obj ${objName} NOT FOUND `);
					reject(err);
				} else {
					// I/O or other error, pass it up the callback
					console.log(`ERROR: mdb.get('${objName}') FAILED`);
					reject(err);
				}
			} else {
				// console.log(`SUCCESS: ${objName} FOUND`);
				try {
					global[objName] = JSON.parse(json) || {};
					resolve();
				} catch (e) {
					return e;
				}
			}
		});
	});
};

Db.prototype.getValue = function (key) {
	const self = this;
	console.log(`PROMISE: getValue for getting ${key}`);
	return new Promise(function (resolve, reject) {
		self.get(key, function (err, json) {
			if (err) {
				if (err.notFound) {
					console.log(`ERROR: key ${key} NOT FOUND `);
					reject(err);
				} else {
					// I/O or other error, pass it up the callback
					console.log(`ERROR: mdb.get('${key}') FAILED`);
					reject(err);
				}
			} else {
				console.log(`SUCCESS: ${key} FOUND`);
				resolve(json);
			}
		});
	});
};

Db.prototype.closeW = function (path) {
	// encrypt Db after closing using the temporarily store MasterPass
	levelup.close();
	fs.readFileSync(path, 'utf8', function (err, data) {
		if (err) throw err;
		Db.encrypt(path, pass);
	});
};

module.exports = Db;
