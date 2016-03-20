'use strict';
/**
 * crypto.js
 * Provides the crypto functionality required
 ******************************/

let secrets = require('secrets.js'),
	fs = require('fs-plus'),
	crypto = require('crypto');

// Crypto default constants
// TODO: change accordingly when changed in settings
let defaults = {
	iterations: 10000,
	keyLength: 32, // in bytes
	algorithm: 'aes-256-ctr',
	digest: 'sha256',
	padLength: 1024
};

/*	Crypto
 *
 *	TODO:
 *	- Implement bitcoin blockchain as source of randomness (in iv generation)
 * - rewrite as promises
 */
// TODO: Implement hmac ciphertext authentication (encrypt-then-MAC) to prevent padding oracle attack
exports.encrypt = function (origpath, destpath, password, callback) {
	// TODO: Use HMAC to authoritatively add metadata about the encryption
	// decrypts any arbitrary data passed with the pass
	let i = defaults.iterations,
		kL = defaults.keyLength,
		ivL = defaults.keyLength/2,
		// pass = (Array.isArray(password)) ? shares2pass(password) : password,
		pass = password;
	const salt = crypto.randomBytes(kL); // generate pseudorandom salt
	const iv = crypto.randomBytes(ivL); // generate pseudorandom iv
	crypto.pbkdf2(pass, salt, i, kL, defaults.digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			const origin = fs.createReadStream(origpath);
			const dest = fs.createWriteStream(destpath);
			const cipher = crypto.createCipheriv(defaults.algorithm, key, iv);
			let destf = destpath.match(/[^/]+[A-z0-9]+\.[A-z0-9]+/g)[0];
			origin.pipe(cipher).pipe(dest, { end: false });

			dest.on('error', () => {
				console.log(`Error while encrypting/writting file to ${dest}`);
				callback(err);
			});

			origin.on('end', () => {
				// Append iv used to encrypt the file to end of file
				dest.write(`\nCryptoSync#${iv.toString('hex')}`);
				dest.end();
				console.log(`End for ${destf} called`);
			});

			dest.on('finish', () => {
				console.log(`Finished encrypted/written to ${destf}`);
				callback(null, [key, iv]);
			});
		}
	});
};

exports.encryptDB = function (origpath, masterpass, callback) {
	// TODO: Use HMAC to authoritatively add metadata about the encryption
	// decrypts any arbitrary data passed with the pass
	const i = 100000,
		kL = defaults.keyLength,
		ivL = defaults.keyLength/2,
		// pass = (Array.isArray(password)) ? shares2pass(password) : password,
		pass = masterpass;
	const salt = crypto.randomBytes(kL); // generate pseudorandom salt
	const iv = crypto.randomBytes(ivL); // generate pseudorandom iv
	crypto.pbkdf2(pass, salt, i, kL, defaults.digest, (err, key) => {
		if (err) {
			// return error to callback YOLO#101
			callback(err);
		} else {
			// console.log(`Pbkdf2 generated key ${key.toString('hex')} using iv = ${iv.toString('hex')}, salt = ${salt.toString('hex')}`);
			let destpath = `${origpath}.crypto`;
			const origin = fs.createReadStream(origpath);
			const zip = zlib.createGzip();
			const dest = fs.createWriteStream(destpath);
			const cipher = crypto.createCipheriv(defaults.algorithm, key, iv);
			let destf = destpath.match(/[^/]+[A-z0-9]+\.[A-z0-9]+/g)[0];
			origin.piep(zip).pipe(cipher).pipe(dest, { end: false });

			dest.on('error', () => {
				console.log(`Error while encrypting/writting file to ${dest}`);
				callback(err);
			});

			origin.on('end', () => {
				// Append iv used to encrypt the file to end of file
				dest.write(`\nCryptoSync#${iv.toString('hex')}`);
				dest.end();
				console.log(`End for ${destf} called`);
			});

			dest.on('finish', () => {
				console.log(`Finished encrypted/written to ${destf}`);
				callback(null, [key, iv]);
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

exports.genPassHash = function (pass, salt) {
	if (salt) {
		return crypto.createHash('sha256').update(pass + salt).digest('hex');
	} else {
		let salt = crypto.randomBytes(32).toString('hex'); // generate 256 random bits
		let hash = crypto.createHash('sha256').update(pass + salt).digest('hex');
		return `${salt}#${hash}`;
	}
};
