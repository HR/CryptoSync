'use strict';
/**
 * MasterPass.js
 * MasterPass functionality
 ******************************/

const crypto = require('./crypto'),
	util = require('./util'),
	_ = require('lodash');
const Main = require('../index');

exports.Prompt = function () {
	return new Promise(function (resolve, reject) {
		Main.MasterPassPrompt(false, function (err) {
			if (err) reject(err);
			resolve();
		});
	});
};

exports.check = function (masterpass, callback) {
	crypto.deriveMasterPassKey(masterpass, global.creds.mpsalt, function (err, mpkey, mpsalt) {
		console.log('checkMasterPass deriveMasterPassKey callback');
		if (err) {
			console.error(`ERROR: deriveMasterPassKey failed, ${err.stack}`);
			return callback(err, null);
		}
		crypto.genPassHash(mpkey, global.creds.mpksalt, function (mpkhash) {
			// console.log(`creds.mpkhash = ${global.creds.mpkhash}, mpkhash (of entered mp) = ${mpkhash}`);
			const MATCH = crypto.verifyPassHash(global.creds.mpkhash, mpkhash); // check if masterpasskey derived is correct
			console.log(`MATCH: ${global.creds.mpkhash} (creds.mpkhash) === ${mpkhash} (mpkhash) = ${MATCH}`);
			return callback(null, MATCH, mpkey);
		});
	});
};

exports.set = function (masterpass, callback) {
	// TODO: decide whther to put updated masterpass instantly
	console.log(`setMasterPass() for ${masterpass}`);
	crypto.deriveMasterPassKey(masterpass, null, function (err, mpkey, mpsalt) {
		global.creds.mpsalt = mpsalt;
		// console.log(`\n global.creds.mpsalt = ${global.creds.mpsalt.toString('hex')}`);
		crypto.genPassHash(mpkey, null, function (mpkhash, mpksalt) {
			global.creds.mpkhash = mpkhash;
			global.creds.mpksalt = mpksalt;
			// console.log(`deriveMasterPassKey callback: \npbkdf2 mpkey = ${mpkey.toString('hex')},\nmpsalt = ${global.creds.mpsalt.toString('hex')},\nmpkhash = ${mpkhash},\nmpksalt = ${mpksalt}`);
			util.saveGlobalObj('creds').then(() => {
				return callback(null, mpkey);
			}).catch((err) => {
				return callback(err);
			});
		});
	});
};
