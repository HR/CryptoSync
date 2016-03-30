console.log(`cwd: ${process.cwd()}`);
const assert = require('assert'),
	expect = require("chai").expect,
	crypto = require('../src/crypto.js'),
	sync = require('../src/sync.js'),
	util = require('../src/util'),
	scrypto = require('crypto'),
	_ = require('lodash'),
	google = require('googleapis'),
	fs = require('fs-extra'),
	exec = require('child_process').exec;


process.chdir('test');
console.log(`cwd: ${process.cwd()}`);

describe('CryptoSync Core Modules\' tests', function () {
	before(function () {
		// Declare globals
		global.paths = {
			home: `CryptoSync`,
			crypted: `CryptoSync/.encrypted`,
			mdb: `mdb`,
			vault: `CryptoSync/vault.crypto`,
		};

		global.state = {};
		global.vault = {};
		global.MasterPass = require('../src/_MasterPass');
		global.MasterPass.set(scrypto.randomBytes(32));

		const gauth = JSON.parse(fs.readFileSync('.cred/gauth.json', 'utf8'));
		// global.files = JSON.parse(fs.readFileSync('test/.cred/rfiles.json', 'utf8'));
		global.state.rfs = JSON.parse(fs.readFileSync('.cred/rfs.json', 'utf8'));

		const o2c = gauth.oauth.oauth2Client;
		global.gAuth = new google.auth.OAuth2(o2c.clientId_, o2c.clientSecret_, o2c.redirectUri_);
		gAuth.setCredentials(o2c.credentials);

		global.drive = google.drive({
			version: 'v3',
			auth: gAuth
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
			rfile = JSON.parse(fs.readFileSync('.cred/rfile.json', 'utf8'));
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
			it('should get file to the correct path', function (done) {
				sync.getQueue.push(rfile, function (err, file) {
					if (err) return done(err);
				});
				sync.getQueue.drain = function () {
					done();
				};
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
		// let rfile;
		before(function () {
			// rfile = JSON.parse(fs.readFileSync('.cred/rfile.json', 'utf8'));
			// global.MasterPass.set(scrypto.randomBytes(32));
		});

		describe('Hashing', function () {
			beforeEach(function () {
				fs.writeFileSync('test.txt', '#CryptoSync', 'utf8');
			});
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
		});

		describe('Encrypting', function () {
			beforeEach(function () {
				fs.writeFileSync('test.txt', '#CryptoSync', 'utf8');
			});
			it('should deriveMasterPassKey using a MasterPass correctly', function (done) {
				const vault = {
					name: 'crypto',
					id: 22,
					secure: true
				};
				crypto.encryptObj(global.vault, global.paths.vault, global.MasterPass.get(), global.creds.viv, function (err, tag) {
					console.log(`crypto.encryptObj callback.`);
					if (err) {
						callback(err);
					} else {
						console.log(`Encrypted successfully with tag = ${tag.toString('hex')}`);
						global.creds.authTag = tag;
						callback(null);
					}
				});
			});
			// it('should encrypt vault obj successfully with masterpass', function (done) {
			// 	const vault = {
			// 		name: 'crypto',
			// 		id: 22,
			// 		secure: true
			// 	};
			// 	crypto.encryptObj(global.vault, global.paths.vault, global.MasterPass.get(), global.creds.viv, function (err, tag) {
			// 		console.log(`crypto.encryptObj callback.`);
			// 		if (err) {
			// 			callback(err);
			// 		} else {
			// 			console.log(`Encrypted successfully with tag = ${tag.toString('hex')}`);
			// 			global.creds.authTag = tag;
			// 			callback(null);
			// 		}
			// 	});
			// });
		});
	});
});
