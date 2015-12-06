'use strict';
let secrets = require('secrets.js'),
		crypto = require('crypto');

// Crypto default constants
// TO DO: change accordingly when changed in settings
let defaults = {
	iterations: 4096,
	keyLength: 128,
	algorithm: 'aes-256-ctr',
	digest: 'sha256',
	padLength: 1024
};


/*	Crypto
 *
 *	TO DO:
 *	- Implement bitcoin blockchain as source of randomness (in iv generation)
 */

exports.encrypt = function (ptext, password, mp, callback) {
	// decrypts any arbitrary data passed with the pass
	let i = defaults.iterations,
			kL = defaults.keyLength,
			pass = (Array.isArray(password)) ? shares2pass(password) : password;
			mp = mp || false;
	const salt = crypto.randomBytes(kL); // generate pseudorandom salt
	const iv = crypto.randomBytes(kL); // generate pseudorandom iv
	if (mp) {
		let cipher = crypto.createCipheriv(defaults.algorithm, password, iv),
				crypted = cipher.update(ptext,'utf8','hex');
		crypted += cipher.final('hex');
		console.log("Encrypted file using mp");
		callback([crypted, key, iv]);
	} else {
		crypto.pbkdf2Sync(pass, salt, i, kL, defaults.digest, function(err, key) {
			if (err){
				throw err;
				// return error to callback
				return callback(null, err);
			} else {
				console.log("Pbkdf2 generated key"+key.toString()+" using iv, salt: "+iv.toString()+", "+salt.toString());
				let cipher = crypto.createCipheriv(defaults.algorithm, key, iv),
						crypted = cipher.update(ptext,'utf8','hex');
				crypted += cipher.final('hex');
				console.log("Encrypted file");
				// supply to callback
				return callback([crypted, key, iv]);
			}
		});
	}
};

exports.decrypt = function (ctext, key, iv, callback) {
	// encrypts any arbitrary data passed with the pass
	let decipher = crypto.createDecipheriv(defaults.algorithm, key, iv),
			decrypted = decipher.update(ctext,'hex','utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
};

exports.shares2pass = function (sharedata) {
	// reconstructs the pass from the shares of the pass
	// using Shamir's Secret Sharing
	/*	TO DO:
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
