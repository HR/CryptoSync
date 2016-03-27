'use strict';
/**
 * crypto.js
 * Provides the crypto functionality required
 ******************************/

const secrets = require('secrets.js'),
	fs = require('fs-extra'),
	fstream = require('fstream'),
	tar = require('tar'),
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
	padLength: 1024,
	mpk_iterations: 100000 // masterpass key iterations
};

/*	Crypto
 *
 *	TODO:
 *	- Implement bitcoin blockchain as source of randomness (in iv generation)
 * - rewrite as promises
 */

// Error handler
function handler(error, at) {
	console.log(`Error ${at} STREAM: Error while OP of file to ${path}`);
	callback(err);
}

// TODO: Implement hmac ciphertext authentication (encrypt-then-MAC) to prevent padding oracle attack
exports.encrypt = function (origpath, destpath, mpkey, callback) {
	// TODO: Use HMAC to authoritatively add metadata about the encryption
	// decrypts any arbitrary data passed with the pass
	let pass = (Array.isArray(mpkey)) ? shares2pass(mpkey) : mpkey;
	// pass = password;
	const salt = crypto.randomBytes(defaults.keyLength); // generate pseudorandom salt
	crypto.pbkdf2(pass, salt, defaults.iterations, defaults.keyLength, defaults.digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			const origin = fs.createReadStream(origpath);
			const dest = fs.createWriteStream(destpath);
			const iv = crypto.randomBytes(defaults.ivLength); // generate pseudorandom iv
			const cipher = crypto.createCipheriv(defaults.algorithm, key, iv);
			let destf = destpath.match(/[^/]+[A-z0-9]+\.[A-z0-9]+/g)[0];

			origin.pipe(cipher).pipe(dest, {
				end: false
			});

			cipher.on('error', () => {
				console.log(`CIPHER STREAM: Error while encrypting ${destf} file`);
				callback(err);
			});

			origin.on('error', () => {
				console.log(`ORIGIN STREAM: Error while reading ${destf} file to ${destpath}`);
				callback(err);
			});

			dest.on('error', () => {
				console.log(`DEST STREAM: Error while writting ${destf} file to ${destpath}`);
				callback(err);
			});

			origin.on('end', () => {
				// Append iv used to encrypt the file to end of file
				dest.write(`\nCryptoSync#${iv.toString('hex')}#${cipher.getAuthTag().toString('hex')}`);
				dest.end();
				console.log(`End (of writestream) for ${destf} called, IV&authTag appended`);
			});

			dest.on('finish', () => {
				const tag = cipher.getAuthTag();
				console.log(`Finished encrypted/written to ${destf}`);
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
		console.log(`JSON.stringify error for ${destpath}`);
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
		console.log(`Finished encrypted/written to ${destpath} with authtag = ${tag.toString('hex')}`);
		callback(null, tag);
	});
};

exports.decryptObj = function (obj, origpath, mpkey, viv, vtag, callback) {
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		digest = defaults.digest;
	const iv = (viv instanceof Buffer) ? viv : new Buffer(viv.data);
	const tag = (vtag instanceof Buffer) ? vtag : new Buffer(vtag.data);
	const streamToString = function (stream, cb) {
		const chunks = [];
		stream.on('data', (chunk) => {
			chunks.push(chunk);
		});
		stream.on('error', function (e) {
			callback(e);
		});
		stream.on('end', () => {
			cb(chunks.join(''));
		});
	};
	console.log(`Decrypting using MasterPass = ${mpkey.toString('hex')}, iv = ${iv.toString('hex')}, tag = ${tag.toString('hex')}`);
	// pass = (Array.isArray(password)) ? shares2pass(password) : password;
	const origin = fs.createReadStream(origpath);
	const decipher = crypto.createDecipheriv(defaults.algorithm, mpkey, iv);
	decipher.setAuthTag(tag);

	const JSONstream = origin.on('error', function (e) {
		callback(e);
	}).pipe(decipher).on('error', function (e) {
		callback(e);
	});

	streamToString(JSONstream, function (json) {
		console.log(`Finished decrypting from ${origpath}`);
		try {
			let vault = JSON.parse(json);
			callback(null, vault);
		} catch (err) {
			console.log(`JSON.parse error for ${origpath}`);
			callback(err);
		}
	});
};

exports.genIv = function (callback) {
	// TODO: check whether to callback inside try or outside
	// TODO: promisify
	try {
		const iv = crypto.randomBytes(defaults.ivLength); // generate pseudorandom iv
		callback(null, iv);
	} catch (err) {
		callback(err);
	}
};

exports.deriveMasterPassKey = function (masterpass, mpsalt, callback) {
	const salt = (mpsalt) ? new Buffer(mpsalt.data) : crypto.randomBytes(defaults.keyLength);
	crypto.pbkdf2(masterpass, salt, defaults.mpk_iterations, defaults.keyLength, defaults.digest, (err, mpkey) => {
		if (err) {
			// return error to callback
			return callback(err);
		} else {
			console.log(`Pbkdf2 generated: \nmpkey = ${mpkey.toString('hex')} \nwith salt = ${salt.toString('hex')}`);
			return callback(null, mpkey, salt);
		}
	});
};

exports.genPassHash = function (mpass, salt, callback) {
	console.log(`crypto.genPassHash() invoked`);
	const pass = (mpass instanceof Buffer) ? mpass.toString('hex') : mpass;

	if (salt) {
		let hash = crypto.createHash('sha256').update(`${pass}${salt}`).digest('hex');
		console.log(`genPassHash: S, pass = ${pass}, salt = ${salt}, hash = ${hash}`);
		callback(hash);
	} else {
		let salt = crypto.randomBytes(defaults.keyLength).toString('hex'); // generate 256 random bits
		let hash = crypto.createHash('sha256').update(`${pass}${salt}`).digest('hex');
		console.log(`genPassHash: NS, pass = ${pass}, salt = ${salt}, hash = ${hash}`);
		callback(hash, salt);
	}
};

exports.verifyPassHash = function (key, hash, callback) {
	return this.genPassHash(key) === hash;
};

exports.decrypt = function (ctext, key, iv, callback) {
	// encrypts any arbitrary data passed with the pass
	let decipher = crypto.createDecipheriv(defaults.algorithm, key, iv),
		decrypted = decipher.update(ctext, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
};

exports.shares2pass = function (sharedata) {
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

	// Extract the shares
	let shares = sharedata[0];
	let pass = secrets.combine(shares);
	// convert back to str
	pass = secrets.hex2str(pass);

	return pass;
};

exports.pass2shares = function (pass, N, S) {
	// splits the pass into shares using Shamir's Secret Sharing

	// convert the text into a hex string
	let pwHex = secrets.str2hex(pass);
	// split into N shares, with a threshold of S
	// Zero padding of defaults.padLength applied to ensure minimal info leak (i.e size of pass)
	let shares = secrets.share(key, N, S, defaults.padLength);

	return [shares, N, S];
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
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
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
				console.error(`Error while encrypting/writting file to ${destpath}`);
				callback(err);
			});

			// origin.on('end', () => {
			// 	// Append iv used to encrypt the file to end of file
			// 	dest.write(`\nCryptoSync#${iv.toString('hex')}`);
			// 	dest.end();
			// 	console.log(`End for ${destf} called`);
			// });

			origin.on('end', () => {
				console.log(`Finished encrypted/written to ${destpath}`);
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
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
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
				console.error(`Error while encrypting/writting file to ${destpath}`);
				callback(err);
			});

			origin.on('end', () => {
				console.log(`Finished encrypted/written to ${destpath}`);
				callback(null, [iv, salt]);
			});
		}
	});
};
