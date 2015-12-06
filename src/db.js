'use strict';
let levelup = require('levelup'),
		fs = require('fs-plus'),
		crypto = require('./crypto'),
		util = require("util");


function Db(path, password) {
	 // Initialize necessary methods/properties from levelup in this instance
	levelup.call(this);

	pass = password || false;
	if (fs.isFileSync(path)) {
		// prompt user for master password and store temporarily (while running)
		if (pass) {
			fs.readFileSync(path, 'hex', function (err, data) {
				if (err) throw err;
				// decrypt Db before opening
				Db.decrypt(path, pass);
			});
			return levelup(path);
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
 *	TO DO:
 *	- Differentiate between MasterPass and secret share as arguments
 *	- Implement treatment accordingly
 */

Db.prototype.decrypt = function (path, pass, callback) {
	// decrypt Db
	// TO DO;
	crypto.decrypt(path, mpass, true, function(decrypted, err) {
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
		console.log("Opened "+path);
		return crypto.encrypt(data, mpass, 5000, 256);
	});
	fs.writeFileSync(path, encrypted, 'hex', function (err) {
		if (err) throw err;
		console.log("Written "+path);
		callback();
	});
};

Db.prototype.close = function (path) {
	// encrypt Db after closing using the temporarily store MasterPass
	levelup.close();
	fs.readFileSync(path, 'utf8', function (err, data) {
		if (err) throw err;
		Db.encrypt(path, pass);
	});
};

module.exports = Db;
