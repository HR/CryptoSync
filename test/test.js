console.log(`cwd: ${process.cwd()}`);
const assert = require('assert'),
	expect = require("chai").expect,
	crypto = require('../src/crypto.js'),
	sync = require('../src/sync.js'),
	util = require('../src/util'),
	sutil = require('util'),
	scrypto = require('crypto'),
	_ = require('lodash'),
	google = require('googleapis'),
	fs = require('fs-extra'),
	exec = require('child_process').exec;

require('dotenv').config();

process.chdir('test');
console.log(`cwd: ${process.cwd()}`);

describe('CryptoSync Core Modules\' tests', function () {
	before(function () {
		// Declare globals
		global.defaults = {
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

		global.paths = {
			home: `CryptoSync`,
			crypted: `CryptoSync/.encrypted`,
			mdb: `mdb`,
			vault: `CryptoSync/vault.crypto`,
		};

		global.state = {};
		global.vault = {
			"RAND0M-ID3": {
				name: 'crypto',
				id: 22,
				secure: true
			},
			"R3C0M-I4D": {
				name: 'cry9to',
				id: 2090,
				secure: false
			}
		};
		global.MasterPassKey = require('../src/_MasterPass');
		global.MasterPassKey.set(scrypto.randomBytes(global.defaults.keyLength));
		console.log(`global.MasterPassKey = ${global.MasterPassKey.get().toString('hex')}`);

		// global.files = JSON.parse(fs.readFileSync('data/rfile.json', 'utf8'));
		global.state.rfs = JSON.parse(fs.readFileSync('data/rfs.json', 'utf8'));

		const credentials = {
			access_token: process.env.access_token,
			token_type: process.env.token_type,
			refresh_token: process.env.refresh_token,
			expiry_date: process.env.expiry_date
		};

		const gAuth = new google.auth.OAuth2(process.env.clientId_, process.env.clientSecret_, process.env.redirectUri_);
		gAuth.setCredentials(credentials);

		global.drive = google.drive({
			version: 'v3',
			auth: gAuth
		});

		global.drive.files.generateIds({
			count: 1,
			space: 'drive'
		}, function (err, res) {
			if (err) {
				console.log(`callback: error genID, ${err.stack}`);
			}
			console.log(`callback: genID ${res}`);
		});

		global.execute = function (command, callback) {
			exec(command, function (error, stdout, stderr) {
				callback(stdout);
			});
		};
	});

	describe('Sync module', function () {
		let rfile;
		before(function () {
			rfile = JSON.parse(fs.readFileSync('data/rfile.json', 'utf8'));
		});

		describe('getQueue', function () {
			beforeEach(function () {
				fs.removeSync(global.paths.home);
			});

			// it('should get remote (API) file completely', function (done) {
			// 	sync.getQueue.push(rfile, function (err, file) {
			// 		if (err) return done(err);
			// 		crypto.genFileHash(file.path, function (err, hash) {
			// 			if (err) return done(err);
			// 			assert.equal(file.md5Checksum, hash);
			// 			done();
			// 		});
			// 	});
			// });
			it('should get file with correct keys', function (done) {
				sync.getQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					expect(file).to.include.keys('path');
					done();
				});
			});
		});
		describe('cryptQueue', function () {
			beforeEach(function () {
				fs.removeSync(global.paths.crypted);
			});

			it('should with remote (API) file without errors', function (done) {
				sync.cryptQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					assert.equal('CryptoSync/.encrypted/test.png.crypto', file.cryptPath);
					done();
				});
			});
			it('should have correct cryptPath', function (done) {
				sync.cryptQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					expect(file.cryptPath).to.equal('CryptoSync/.encrypted/test.png.crypto');
					done();
				});
			});
			it('should write to the right location at CryptoSync/.encrypted/', function (done) {
				sync.cryptQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					expect(util.checkFileSync('CryptoSync/.encrypted/test.png.crypto')).to.be.true;
					done();
				});
			});
		});
	});

	describe('Crypto module', function () {
		before(function () {
			fs.writeFileSync('test.txt', '#CryptoSync', 'utf8');
		});

		after(function () {
			fs.removeSync('test.txt');
			fs.removeSync('test2.txt');
			fs.removeSync('test.txt.crypto');
		});

		describe('Hashing & deriving', function () {
			const masterpass = "crypto#101";

			it('should get same digest hash for genFileHash as openssl', function (done) {
				crypto.genFileHash('test.txt', function (err, hash) {
					if (err) done(err);
					global.execute('openssl dgst -md5 test.txt', function (stdout, err, stderr) {
						if (err !== null) done(err);
						// if (stderr !== null) done(stderr);
						let ohash = stdout.replace('MD5(test.txt)= ', '');
						expect(hash).to.equal(ohash);
						done();
					});
				});
			});

			it('should deriveMasterPassKey using a MasterPass correctly when salt is buffer', function (done) {
				crypto.deriveMasterPassKey(masterpass, null, function (err, dmpkey, dmpsalt) {
					if (err) done(err);
					crypto.deriveMasterPassKey(masterpass, dmpsalt, function (err, mpkey, mpsalt) {
						if (err) done(err);
						expect(dmpkey.toString('hex')).to.equal(mpkey.toString('hex'));
						done();
					});
				});
			});

			it('should deriveMasterPassKey using a MasterPass correctly with persistent salt', function (done) {
				crypto.deriveMasterPassKey(masterpass, null, function (err, dmpkey, dmpsalt) {
					if (err) done(err);
					const pdmpsalt = JSON.parse(JSON.stringify(dmpsalt));
					crypto.deriveMasterPassKey(masterpass, pdmpsalt, function (err, mpkey, mpsalt) {
						if (err) done(err);
						expect(dmpkey.toString('hex')).to.equal(mpkey.toString('hex'));
						done();
					});
				});
			});
		});

		describe('Encryption', function () {
			it('should generate iv, encrypt & decrypt vault obj with MPKey when salt is buffer', function (done) {
				crypto.genIv(function (err, viv) {
					if (err) done(err);
					crypto.encryptObj(global.vault, global.paths.vault, global.MasterPassKey.get(), viv, function (err, authTag) {
						if (err) done(err);
						crypto.decryptObj(global.paths.vault, global.MasterPassKey.get(), viv, authTag, function (err, devaulted) {
							if (err) done(err);
							expect(devaulted).to.deep.equal(global.vault);
							done();
						});
					});
				});
			});

			it('should generate iv, encrypt & decrypt vault obj with MPKey with persistent salt', function (done) {
				crypto.genIv(function (err, viv) {
					if (err) done(err);
					const pviv = JSON.parse(JSON.stringify(viv));
					crypto.encryptObj(global.vault, global.paths.vault, global.MasterPassKey.get(), pviv, function (err, authTag) {
						if (err) done(err);
						crypto.decryptObj(global.paths.vault, global.MasterPassKey.get(), viv, authTag, function (err, devaulted) {
							if (err) done(err);
							expect(devaulted).to.deep.equal(global.vault);
							done();
						});
					});
				});
			});

			it('should encrypt file with pass without errors & have all expected creds', function (done) {
				before(function () {
					fs.writeFileSync('test.txt', '#CryptoSync', 'utf8');
				});
				crypto.encrypt('test.txt', 'test.txt.crypto', global.MasterPassKey.get(), function (err, key, iv, tag) {
					if (err) done(err);
					try {
						let file = {};
						file.iv = iv.toString('hex');
						file.authTag = tag.toString('hex');
						done();
					} catch (err) {
						if (err) done(err);
					}
				});
			});

			// it('should encrypt and decrypt file with pass', function (done) {
			// 	crypto.encrypt('test.txt', 'test.txt.crypto', global.MasterPassKey.get(), function (err, key, iv, tag) {
			// 		if (err) done(err);
			// 		crypto.decrypt('test.txt.crypto', 'test2.txt', key, null, null, function (err, iv, tag) {
			// 			if (err) done(err);
			// 			fs.readFile('test2.txt', function read(err, data) {
			// 				if (err) done(err);
			// 				expect(data.toString('utf8')).to.equal('#CryptoSync');
			// 				done();
			// 			});
			// 		});
			// 	});
			// });

			it('should convert key to shares and back with shares obj', function (done) {
				const key = scrypto.randomBytes(defaults.keyLength).toString('hex');
				const sharesObj = crypto.pass2shares(key);
				const ckey = crypto.shares2pass(sharesObj);
				const ckeyArray = crypto.shares2pass(sharesObj.data);
				expect(ckey).to.equal(key);
				expect(ckeyArray).to.equal(key);
				done();
			});
		});
	});
});
