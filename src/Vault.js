'use strict';
/**
 * Vault.js
 * Vault functionality
 ******************************/
const _ = require('lodash'),
	moment = require('moment'),
	util = require('./util'),
	sutil = require('util'),
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
	// console.log(`initVault invoked. Creating global vault obj & encrypting...`);
	global.vault = {};
	global.vault.creationDate = moment().format();
	// TODO: decide whether to use crypto.encryptObj or genIvSalt (and then encryptObj
	// & remove gen functionality from crypto.encryptObj)
	crypto.genIV()
	.then(function (iv) {
		// console.log(`crypto.genIvSalt callback.`);
		global.creds.viv = iv;
		// console.log(`Encrypting using MasterPass = ${global.MasterPassKey.get().toString('hex')}, viv = ${global.creds.viv.toString('hex')}`);
	})
	.then(() => {
		exports.encrypt(mpkey).then(() => {
			callback();
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
				console.error(`decryptObj ERR: ${err.stack}`);
				reject(err);
			} else {
				global.vault = vault;
				console.log(`Decrypted vault, vault's content is ${sutil.inspect(vault).substr(0, 20)}`);
				resolve();
			}
		});
	});
};

exports.encrypt = function (mpkey) {
	return new Promise(function (resolve, reject) {
		crypto.encryptObj(global.vault, global.paths.vault, mpkey, global.creds.viv, function (err, tag) {
			console.log(`crypto.encryptObj invoked...`);
			if (err) {
				reject(err);
			} else {
				console.log(`Encrypted successfully with tag = ${tag.toString('hex')}, saving auth tag and closing mdb...`);
				global.creds.authTag = tag;
				resolve();
			}
		});
	});
};
