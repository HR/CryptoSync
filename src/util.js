'use strict';
/**
 * util.js
 * Contains essential common utilities required
 ******************************/
const _ = require('lodash'),
	fs = require('fs');

exports.checkDirectorySync = function (dir) {
	try {
		fs.statSync(filePath);
	} catch (err) {
		if (err.code == 'ENOENT') return false;
	}
	return true;
};

exports.checkFileSync = function (path) {
	try {
		fs.accessSync(path, fs.F_OK);
	} catch (err) {
		if (err.code == 'ENOENT') return false;
	}
	return true;
};

exports.getValue = function (key, db = global.mdb) {
	console.log(`PROMISE: getValue for getting ${key}`);
	return new Promise(function (resolve, reject) {
		db.get(key, function (err, json) {
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


exports.saveGlobalObj = function (objName, db = global.mdb) {
	console.log(`PROMISE: saveGlobalObj for ${objName}`);
	return new Promise(function (resolve, reject) {
		if (!(_.isEmpty(global[objName]))) {
			db.put(objName, JSON.stringify(global[objName]), function (err) {
				if (err) {
					console.log(`ERROR: mdb.put('${objName}') failed, ${err}`);
					// I/O or other error, pass it up the callback
					reject(err);
				}
				console.log(`SUCCESS: mdb.put('${objName}')`);
				resolve();
			});
		} else {
			console.log('Nothing to save; empty.');
			resolve();
		}
	});
};

exports.restoreGlobalObj = function (objName, db = global.mdb) {
	console.log(`PROMISE: restoreGlobalObj for ${objName}`);
	return new Promise(function (resolve, reject) {
		db.get(objName, function (err, json) {
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
				console.log(`SUCCESS: ${objName} FOUND`);
				try {
					global[objName] = JSON.parse(json) || {};
					setTimeout(function () {
						console.log(`resolve global.${objName} called`);
						resolve();
					}, 0);
				} catch (e) {
					return e;
				}
			}
		});
	});
};
