'use strict';
/**
 * crypto.js
 * Provides the crypto functionality required
 ******************************/

const secrets = require('secrets.js'),
	fs = require('fs-extra'),
	util = require('./util'),
	fstream = require('fstream'),
	tar = require('tar'),
	logger = require('../logger'),
	_ = require('lodash'),
	zlib = require('zlib'),
	Readable = require('stream').Readable,
	crypto = require('crypto');

// Crypto default constants
// TODO: change accordingly when changed in settings
// TODO: add defaults for db/vault encryption
let defaults = {
	iterations: 4096, // file encryption key iterations
	keyLength: 32, // in bytes
	ivLength: 12,
	algorithm: 'aes-256-gcm',
	salgorithm: 'aes-256-ctr',
	digest: 'sha256',
	hash_alg: 'sha256',
	check_hash_alg: 'md5',
	padLength: 1024,
	mpk_iterations: 100000, // masterpass key iterations
	shares: 3,
	threshold: 2
};

/*	Crypto
 *
 *	TODO:
 *	- Implement bitcoin blockchain as source of randomness (in iv generation)
 * - rewrite as promises
 */

// Error handler
function handler(error, at) {
	logger.verbose(`Error ${at} STREAM: Error while OP of file to ${path}`);
	callback(err);
}

// TODO: Implement hmac ciphertext authentication (encrypt-then-MAC) to prevent padding oracle attack
exports.encrypt = function (origpath, destpath, mpkey, callback) {
	// decrypts any arbitrary data passed with the pass
	let pass = (Array.isArray(mpkey)) ? shares2pass(mpkey) : mpkey;
	// pass = password;
	const salt = crypto.randomBytes(defaults.keyLength); // generate pseudorandom salt
	crypto.pbkdf2(pass, salt, defaults.iterations, defaults.keyLength, defaults.digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// logger.verbose(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			const origin = fs.createReadStream(origpath);
			const dest = fs.createWriteStream(destpath);
			const iv = crypto.randomBytes(defaults.ivLength); // generate pseudorandom iv
			const cipher = crypto.createCipheriv(defaults.algorithm, key, iv);
			let destf = destpath.match(/[^/]+[A-z0-9]+\.[A-z0-9]+/g)[0];

			origin.pipe(cipher).pipe(dest, {
				end: false
			});

			cipher.on('error', () => {
				logger.verbose(`CIPHER STREAM: Error while encrypting ${destf} file`);
				callback(err);
			});

			origin.on('error', () => {
				logger.verbose(`ORIGIN STREAM: Error while reading ${destf} file to ${destpath}`);
				callback(err);
			});

			dest.on('error', () => {
				logger.verbose(`DEST STREAM: Error while writting ${destf} file to ${destpath}`);
				callback(err);
			});

			origin.on('end', () => {
				// Append iv used to encrypt the file to end of file
				dest.write(`\nCryptoSync#${iv.toString('hex')}#${cipher.getAuthTag().toString('hex')}`);
				dest.end();
				// logger.verbose(`End (of writestream) for ${destf} called, IV&authTag appended`);
			});

			dest.on('finish', () => {
				const tag = cipher.getAuthTag();
				// logger.verbose(`Finished encrypted/written to ${destf}`);
				callback(null, key, iv, tag);
			});
		}
	});
};

exports.encryptObj = function (obj, destpath, mpkey, viv, callback) {
	// TODO: Use HMAC to authoritatively add metadata about the encryption
	// decrypts any arbitrary data passed with the pass
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		ivL = defaults.ivLength,
		digest = defaults.digest;
	// pass = (Array.isArray(password)) ? shares2pass(password) : password,

	const iv = (viv instanceof Buffer) ? viv : new Buffer(viv.data);
	const origin = new Readable();
	try {
		const json = JSON.stringify(obj);
		origin.push(json); // writes the json string of obj to stream
		origin.push(null); // indicates end-of-file basically - the end of the stream
	} catch (err) {
		logger.verbose(`JSON.stringify error for ${destpath}`);
		callback(err);
	}
	const dest = fs.createWriteStream(destpath);
	const cipher = crypto.createCipheriv(defaults.algorithm, mpkey, iv);

	origin.on('error', function (e) {
			callback(e);
		})
		.pipe(cipher).on('error', function (e) {
			callback(e);
		})
		.pipe(dest).on('error', function (e) {
			callback(e);
		});

	dest.on('finish', () => {
		const tag = cipher.getAuthTag();
		// logger.verbose(`Finished encrypted/written to ${destpath} with authtag = ${tag.toString('hex')}`);
		callback(null, tag);
	});
};

exports.decryptObj = function (origpath, mpkey, viv, vtag, callback) {
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		digest = defaults.digest;
	const iv = (viv instanceof Buffer) ? viv : new Buffer(viv.data);
	const tag = (vtag instanceof Buffer) ? vtag : new Buffer(vtag.data);

	// logger.verbose(`Decrypting using MasterPass = ${mpkey.toString('hex')}, iv = ${iv.toString('hex')}, tag = ${tag.toString('hex')}`);
	// pass = (Array.isArray(password)) ? shares2pass(password) : password;
	const origin = fs.createReadStream(origpath);
	const decipher = crypto.createDecipheriv(defaults.algorithm, mpkey, iv);
	decipher.setAuthTag(tag);

	const JSONstream = origin.on('error', function (e) {
		callback(e);
	}).pipe(decipher).on('error', function (e) {
		callback(e);
	});

	util.streamToString(JSONstream, function (err, json) {
		// logger.verbose(`Finished decrypting from ${origpath}`);
		if (err) callback(err);
		try {
			let vault = JSON.parse(json);
			callback(null, vault);
		} catch (err) {
			logger.verbose(`JSON.parse error for ${origpath}`);
			callback(err);
		}
	});
};

exports.genIV = function () {
	// TODO: check whether to callback inside try or outside
	// TODO: promisify
	return new Promise(function(resolve, reject) {
		try {
			const iv = crypto.randomBytes(defaults.ivLength); // Synchronous gen
			resolve(iv);
		} catch (err) {
			reject(err);
		}
	});
};

exports.deriveMasterPassKey = function (masterpass, mpsalt, callback) {
	const salt = (mpsalt) ? ((mpsalt instanceof Buffer) ? mpsalt : new Buffer(mpsalt.data)) : crypto.randomBytes(defaults.keyLength);
	crypto.pbkdf2(masterpass, salt, defaults.mpk_iterations, defaults.keyLength, defaults.digest, (err, mpkey) => {
		if (err) {
			// return error to callback
			return callback(err);
		} else {
			// logger.verbose(`Pbkdf2 generated: \nmpkey = ${mpkey.toString('hex')} \nwith salt = ${salt.toString('hex')}`);
			return callback(null, mpkey, salt);
		}
	});
};

exports.genPassHash = function (mpass, salt, callback) {
	// logger.verbose(`crypto.genPassHash() invoked`);
	const pass = (mpass instanceof Buffer) ? mpass.toString('hex') : mpass;

	if (salt) {
		const hash = crypto.createHash(defaults.hash_alg).update(`${pass}${salt}`).digest('hex');
		// logger.verbose(`genPassHash: S, pass = ${pass}, salt = ${salt}, hash = ${hash}`);
		callback(hash);
	} else {
		const salt = crypto.randomBytes(defaults.keyLength).toString('hex');
		const hash = crypto.createHash(defaults.hash_alg).update(`${pass}${salt}`).digest('hex');
		// logger.verbose(`genPassHash: NS, pass = ${pass}, salt = ${salt}, hash = ${hash}`);
		callback(hash, salt);
	}
};

exports.verifyPassHash = function (mpkhash, gmpkhash) {
	return _.isEqual(mpkhash, gmpkhash);
};

exports.genFileHash = function (origpath, callback) {
	let fd = fs.createReadStream(origpath);
	const hash = crypto.createHash(defaults.check_hash_alg);
	hash.setEncoding('hex');
	fd.on('end', function () {
		hash.end();
		let fhash = hash.read();
		// logger.verbose(`genFileHash: fhash = ${fhash}`);
		callback(null, fhash);
	});

	fd.on('error', function (e) {
		callback(e);
	}).pipe(hash).on('error', function (e) {
		callback(e);
	});
};

exports.verifyFileHash = function (fhash, gfhash) {
	return _.isEqual(fhash, gfhash);
};

exports.decrypt = function (origpath, destpath, key, iv, authTag, callback) {
	// encrypts any arbitrary data passed with the pass
	// const pass = (Array.isArray(key)) ? shares2pass(key) : key;
	if (!authTag || !iv) {
		// extract from last line of file
		fs.readFile(origpath, 'utf-8', function (err, data) {
			if (err) callback(err);

			let lines = data.trim().split('\n');
			let lastLine = lines.slice(-1)[0];
			let fields = lastLine.split('#');
			if (_.isEqual(fields[0], "CryptoSync")) {
				const iv = new Buffer(fields[1], 'hex');
				const authTag = new Buffer(fields[2], 'hex');
				const mainData = lines.slice(0, -1).join();
				let origin = new Readable;
				// read as stream
				origin.push(mainData);
				origin.push(null);

				const decipher = crypto.createDecipheriv(defaults.algorithm, key, iv);
				decipher.setAuthTag(authTag);
				const dest = fs.createWriteStream(destpath);

				origin.pipe(decipher).pipe(dest);

				decipher.on('error', () => {
					callback(err);
				});

				origin.on('error', () => {
					callback(err);
				});

				dest.on('error', () => {
					callback(err);
				});

				dest.on('finish', () => {
					logger.verbose(`Finished encrypted/written to ${destf}`);
					callback(null, iv, tag);
				});
			} else {
				callback(new Error('IV and authTag not supplied'));
			}
		});
	} else {
		// TODO: Implement normal flow
	}
};

exports.pass2shares = function (pass, total = defaults.shares, th = defaults.threshold) {
	// splits the pass into shares using Shamir's Secret Sharing
	// convert the text into a hex string
	try {
		// pass = secrets.str2hex(pass);
		// split into N shares, with a threshold of th
		// Zero padding of defaults.padLength applied to ensure minimal info leak (i.e size of pass)
		const shares = secrets.share(pass, total, th, defaults.padLength);
		const sharesd = {
			data: shares,
			total: total,
			threshold: th
		};
		return sharesd;
	} catch (err) {
		throw err;
	}
};

/**
 * @param {array} of at least the threshold length
 */
exports.shares2pass = function (sharesd) {
	// reconstructs the pass from the shares of the pass
	// using Shamir's Secret Sharing
	/*	TODO:
	 *	Parsing shares[type = Array]:
	 *	- shares = [["s1", "s2",..., "sS"], "S", "N"]
	 *	- N = total number of shares originally generated
	 *	- S = number of shares (threshold) required to reconstruct key and decrypt
	 **/
	// let S = sharedata[2],
	// let N = sharedata[1];
	try {
		// Extract the shares
		const shares = (_.isArray(sharesd)) ? sharesd : sharesd.data;
		const pass = secrets.combine(shares);
		// convert back to str
		const hpass = (pass).toString('hex');
		return hpass;
	} catch (err) {
		throw err;
	}
};

exports.encryptDB = function (origpath, mpkey, viv, vsalt, callback) {
	// TODO: Use HMAC to authoritatively add metadata about the encryption
	// decrypts any arbitrary data passed with the pass
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		ivL = defaults.ivLength,
		digest = defaults.digest;
	// pass = (Array.isArray(password)) ? shares2pass(password) : password,
	const salt = (vsalt) ? new Buffer(vsalt, 'utf8') : crypto.randomBytes(kL); // generate pseudorandom salt
	const iv = (viv) ? new Buffer(viv, 'utf8') : crypto.randomBytes(ivL); // generate pseudorandom iv
	crypto.pbkdf2(mpkey, salt, i, kL, digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// logger.verbose(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			let destpath = `${origpath}.crypto`;
			const origin = fstream.Reader({
				'path': origpath,
				'type': 'Directory'
			});
			const dest = fstream.Writer({
				'path': destpath
			});
			const cipher = crypto.createCipheriv(defaults.algorithm, key, iv);
			// Read the source directory
			origin.pipe(tar.Pack()) // Convert the directory to a .tar file
				.pipe(zlib.Gzip()) // Compress the .tar file
				.pipe(cipher) // Encrypt
				.pipe(dest); // Give the output file name
			// origin.pipe(zip).pipe(cipher).pipe(dest);
			origin.on('error', () => {
				logger.error(`Error while encrypting/writting file to ${destpath}`);
				callback(err);
			});

			// origin.on('end', () => {
			// 	// Append iv used to encrypt the file to end of file
			// 	dest.write(`\nCryptoSync#${iv.toString('hex')}`);
			// 	dest.end();
			// 	logger.verbose(`End for ${destf} called`);
			// });

			origin.on('end', () => {
				logger.verbose(`Finished encrypted/written to ${destpath}`);
				callback(null, [iv, salt]);
			});
		}
	});
};

exports.decryptDB = function (origpath, mpkey, viv, vsalt, callback) {
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		digest = defaults.digest;
	const iv = new Buffer(viv, 'utf8');
	const salt = new Buffer(vsalt, 'utf8');
	// pass = (Array.isArray(password)) ? shares2pass(password) : password;
	crypto.pbkdf2(mpkey, salt, i, kL, digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// logger.verbose(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			let destpath = origpath.replace(/[\.]{1}(crypto)/g, '');
			const origin = fstream.Reader({
				'path': origpath,
			});
			const dest = fstream.Writer({
				'path': destpath,
				'type': 'Directory'
			});
			const decipher = crypto.createDecipheriv(defaults.algorithm, key, iv);

			origin.pipe(zlib.Unzip()) // uncompress archive to a .tar file
				.pipe(tar.Extract()) // Convert .tar file to directory
				.pipe(decipher) // Decrypt
				.pipe(dest); // Give the output file name

			origin.on('error', () => {
				logger.error(`Error while encrypting/writting file to ${destpath}`);
				callback(err);
			});

			origin.on('end', () => {
				logger.verbose(`Finished encrypted/written to ${destpath}`);
				callback(null, [iv, salt]);
			});
		}
	});
};
