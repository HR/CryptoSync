'use strict';
/**
 * Custom DB (levelup) API implementation
 **/
let levelup = require('levelup'),
	fs = require('fs-plus'),
	crypto = require('./crypto'),
	util = require("util");

function readFile(filename, enc) {
	return new Promise(function (fulfill, reject) {
		fs.readFile(filename, enc, function (err, res) {
			if (err) reject(err);
			else fulfill(res);
		});
	});
}

function Db(path, password) {
	// Initialize necessary methods/properties from levelup in this instance
	// levelup.call(this);

	var pass = password || false;
	if (fs.isFileSync(path)) {
		// prompt user for master password and store temporarily (while running)
		if (pass) {
			return readFile(path, 'hex')
				.then(Db.decrypt(path, pass)) // decrypt Db before opening
				.then(function (value) {
					// on fulfillment
					return levelup(path);
				}, function (reason) {
					// rejection
				})
				.catch(function (reason) {
					console.log('Handle rejected promise (' + reason + ') here.');
				});
		} else {
			return levelup(path);
		}
	} else {
		// Invoke SetMasterPass routine
		return levelup(path);
	}
}

// Inherit functions from levelup's prototype
util.inherits(Db, levelup);

/*	Crypto
 *
 *	TODO:
 *	- Differentiate between MasterPass and secret share as arguments
 *	- Implement treatment accordingly
 */

Db.prototype.decrypt = function (path, pass, callback) {
	// decrypt Db
	// TODO;
	crypto.decrypt(path, mpass, true, function (decrypted, err) {
		if (err) {
			callback(null, err);
		} else {
			callback(decrypted);
		}
	});
};

Db.prototype.encrypt = function (path, pass, callback) {
	// encrypt Db
	let mpass = (Array.isArray(pass)) ? crypto.shares2pass(pass) : pass;
	let encrypted = fs.readFileSync(path, 'utf8', function (err, data) {
		if (err) throw err;
		console.log(`Opened ${path}`);
		return crypto.encrypt(data, mpass, 5000, 256);
	});
	fs.writeFileSync(path, encrypted, 'hex', function (err) {
		if (err) throw err;
		console.log(`Written ${path}`);
		callback();
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
