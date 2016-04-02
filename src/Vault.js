'use strict';
/**
 * Vault.js
 * Vault functionality
 ******************************/
const _ = require('lodash'),
	moment = require('moment'),
	util = require('./util'),
	sutil = require('util'),
	logger = require('../logger'),
	crypto = require('./crypto');

const self = this;

// function Vault(crypted, path, viv, data) {
// 	this.crypted = encrypted;
// 	this.path = path;
// 	this.viv = viv;
// 	this.data = data;
// }

// TODO: fully promisify
exports.init = function (mpkey, callback) {
	logger.verbose(`Vault.init invoked. Creating global vault obj & encrypting...`);
	global.vault = {};
	global.vault.creationDate = moment().format();
	// TODO: decide whether to use crypto.encryptObj or genIvSalt (and then encryptObj
	// & remove gen functionality from crypto.encryptObj)
	crypto.genIV()
	.then(function (iv) {
		// logger.verbose(`crypto.genIvSalt callback.`);
		global.creds.viv = iv;
		logger.verbose(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`);
	})
	.then(() => {
		exports.encrypt(mpkey).then(() => {
			callback();
		})
		.catch((err) => {
			callback(err);
		});
	})
	.catch((err) => {
		callback(err);
	});
};

exports.decrypt = function (mpkey) {
	return new Promise(function (resolve, reject) {
		crypto.decryptObj(global.paths.vault, mpkey, global.creds.viv, global.creds.authTag, function (err, vault) {
			if (err) {
				logger.error(`decryptObj ERR: ${err.stack}`);
				reject(err);
			} else {
				global.vault = vault;
				logger.verbose(`Decrypted vault, vault's content is ${sutil.inspect(vault).substr(0, 30)}`);
				resolve();
			}
		});
	});
};

exports.encrypt = function (mpkey) {
	return new Promise(function (resolve, reject) {
		crypto.encryptObj(global.vault, global.paths.vault, mpkey, global.creds.viv, function (err, tag) {
			logger.verbose(`crypto.encryptObj invoked...`);
			if (err) {
				reject(err);
			} else {
				// logger.verbose(`Encrypted successfully with tag = ${tag.toString('hex')}, saving auth tag and closing mdb...`);
				global.creds.authTag = tag;
				resolve(tag);
			}
		});
	});
};
