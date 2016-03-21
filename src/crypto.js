'use strict';
/**
 * crypto.js
 * Provides the crypto functionality required
 ******************************/

let secrets = require('secrets.js'),
	fs = require('fs-plus'),
	fstream = require('fstream'),
	tar = require('tar'),
	zlib = require('zlib'),
	Readable = require('stream').Readable,
	crypto = require('crypto');

// Crypto default constants
// TODO: change accordingly when changed in settings
// TODO: add defaults for db/vault encryption
let defaults = {
	iterations: 4096,
	keyLength: 32, // in bytes
	ivLength: 16,
	algorithm: 'aes-256-ctr',
	digest: 'sha256',
	padLength: 1024,
	mpk_iterations: 100000
};

/*	Crypto
 *
 *	TODO:
 *	- Implement bitcoin blockchain as source of randomness (in iv generation)
 * - rewrite as promises
 */
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

			origin.on('end', () => {
				// Append iv used to encrypt the file to end of file
				dest.write(`\nCryptoSync#${iv.toString('hex')}`);
				dest.end();
				console.log(`End for ${destf} called`);
			});

			origin.on('error', () => {
				console.log(`ORIGIN STREAM: Error while encrypting/writting file to ${dest}`);
				callback(err);
			});

			dest.on('error', () => {
				console.log(`DEST STREAM: Error while encrypting/writting file to ${dest}`);
				callback(err);
			});

			dest.on('finish', () => {
				console.log(`Finished encrypted/written to ${destf}`);
				callback(null, [key, iv, salt]);
			});
		}
	});
};

exports.encryptObj = function (obj, destpath, mpkey, viv, vsalt, callback) {
	// TODO: Use HMAC to authoritatively add metadata about the encryption
	// decrypts any arbitrary data passed with the pass
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		ivL = defaults.ivLength,
		digest = defaults.digest;

	try {
		const json = JSON.stringify(obj);
	} catch (err) {
		console.log(`JSON.stringify error for ${destpath}`);
		callback(err);
	}
	// pass = (Array.isArray(password)) ? shares2pass(password) : password,
	const salt = (vsalt) ? new Buffer(vsalt, 'utf8') : crypto.randomBytes(kL); // generate pseudorandom salt
	const iv = (viv) ? new Buffer(viv, 'utf8') : crypto.randomBytes(ivL); // generate pseudorandom iv
	crypto.pbkdf2(mpkey, salt, i, kL, digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			const origin = new Readable();
			origin.push(json); // writes the json string of obj to stream
			origin.push(null); // indicates end-of-file basically - the end of the stream
			const dest = fs.createWriteStream(destpath);
			const cipher = crypto.createCipheriv(defaults.algorithm, key, iv);

			origin.pipe(cipher).pipe(dest);

			// TODO: append iv and salt at the end of the file once written
			// origin.on('end', () => {
			// 	// Append iv used to encrypt the file to end of file
			// 	dest.write(`\nCryptoSync#${iv.toString('hex')}`);
			// 	dest.end();
			// 	console.log(`End for ${destf} called`);
			// });

			origin.on('error', () => {
				console.log(`ORIGIN STREAM: Error while encrypting/writting file to ${destpath}`);
				callback(err);
			});

			dest.on('error', () => {
				console.log(`DEST STREAM: Error while encrypting/writting file to ${destpath}`);
				callback(err);
			});

			dest.on('finish', () => {
				console.log(`Finished encrypted/written to ${destpath}`);
				callback(null, [iv, salt]);
			});
		}
	});
};

exports.decryptObj = function (obj, origpath, mpkey, viv, vsalt, callback) {
	const i = defaults.mpk_iterations,
		kL = defaults.keyLength,
		digest = defaults.digest;
	const iv = new Buffer(viv, 'utf8');
	const salt = new Buffer(vsalt, 'utf8');
	const streamToString = function (stream, cb) {
		const chunks = [];
		stream.on('data', (chunk) => {
			chunks.push(chunk);
		});
		stream.on('end', () => {
			cb(chunks.join(''));
		});
	};
	// pass = (Array.isArray(password)) ? shares2pass(password) : password;
	crypto.pbkdf2(mpkey, salt, i, kL, digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			const origin = fs.createReadStream(origpath);
			const decipher = crypto.createDecipheriv(defaults.algorithm, key, iv);

			const stream = origin.pipe(decipher);
			streamToString(stream, function (json) {
				console.log(`Finished encrypted/written to ${origpath}`);
				try {
				  let vault = JSON.parse(json);
				} catch (err) {
					console.log(`JSON.parse error for ${destpath}`);
					callback(err);
				}
				callback(null, vault);
			});
			origin.on('error', () => {
				console.log(`ORIGIN STREAM: Error while encrypting/writting file to ${origpath}`);
				callback(err);
			});

			// dest.on('error', () => {
			// 	console.log(`DEST STREAM: Error while encrypting/writting file to ${dest}`);
			// 	callback(err);
			// });
			//
			// dest.on('finish', () => {
			// 	console.log(`Finished encrypted/written to ${destf}`);
			// 	try {
			// 	  let vault = JSON.parse(dest);
			// 	} catch (err) {
			// 		console.log(`JSON.parse error for ${dest}`);
			// 		callback(err);
			// 	}
			// 	callback(null, vault);
			// });
		}
	});
};

exports.deriveMasterPassKey = function (masterpass, cred, callback) {
	const salt = (cred) ? new Buffer(cred.salt, 'utf8') : crypto.randomBytes(defaults.keyLength),
		i = (cred) ? cred.iterations : defaults.mpk_iterations;
	crypto.pbkdf2(masterpass, salt, i, defaults.keyLength, defaults.digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			console.log(`Pbkdf2 generated key ${key.toString('hex')}, salt = ${salt.toString('hex')}`);
			callback(null, key, {
				salt: salt,
				iterations: i
			});
		}
	});
};

exports.decrypt = function (ctext, key, iv, callback) {
	// encrypts any arbitrary data passed with the pass
	let decipher = crypto.createDecipheriv(defaults.algorithm, key, iv),
		decrypted = decipher.update(ctext, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
};

exports.verifyPassHash = function (key, hash, callback) {
	return this.genPassHash(key) === hash;
};

exports.genPassHash = function (pass, salt, callback) {
	console.log(`crypto.genPassHash(${pass}, ${salt}) invoked`);
	if (salt) {
		let mpkhash = crypto.createHash('sha256').update(pass + salt).digest('hex');
		callback(mpkhash);
	} else {
		let salt = crypto.randomBytes(defaults.keyLength).toString(); // generate 256 random bits
		let hash = crypto.createHash('sha256').update(pass + salt).digest('hex');
		callback(hash, salt);
	}
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
