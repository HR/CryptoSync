console.log(`cwd: ${process.cwd()}`);
const assert = require('assert'),
	expect = require("chai").expect,
	crypto = require('../src/crypto.js'),
	sync = require('../src/sync.js'),
	util = require('../src/util'),
	scrypto = require('crypto'),
	_ = require('lodash'),
	google = require('googleapis'),
	fs = require('fs');

process.chdir('test');
console.log(`cwd: ${process.cwd()}`);

describe('CryptoSync Core Modules\' tests', function () {
	before(function () {
		// runs before all tests in this block
		global.paths = {
			home: `CryptoSync`,
			crypted: `CryptoSync/.encrypted`,
			mdb: `mdb`,
			vault: `CryptoSync/vault.crypto`,
		};

		global.state = {};
		global.vault = {};
		global.MasterPass = require('../src/_MasterPass');

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
	});

	describe('Sync module', function () {
		let rfile;
		before(function () {
			rfile = JSON.parse(fs.readFileSync('.cred/rfile.json', 'utf8'));
			global.MasterPass.set(scrypto.randomBytes(32));
		});

		describe('getQueue', function () {
			it('should get remote (API) file completely', function () {
				sync.getQueue.push(rfile, function (err, file) {
					done(new Error('something wrong'));
					if (err) return done(err);
					crypto.genFileHash(file.path, function (err, hash) {
						if (err) return done(err);
						assert.equal(file.md5Checksum, hash);
						done();
					});
				});
			});
			it('should get file to the correct path', function () {
				sync.getQueue.push(rfile, function (err, file) {
					if (err) return done(err);
				});
				sync.getQueue.drain = function () {
					done();
				};
			});
		});
		describe('cryptQueue', function () {
			it('should with remote (API) file without errors', function () {
				sync.cryptQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					assert.equal(file.cryptPath, 'CryptoSync/.encrypted/test.png.crypto');
					done();
				});
			});
			it('should have correct cryptPath', function () {
				sync.cryptQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					assert.equal(file.cryptPath, 'CryptoSync/.encrypted/test.png.crypto');
					done();
				});
			});
			it('should write to the right location at CryptoSync/.encrypted/', function () {
				sync.cryptQueue.push(rfile, function (err, file) {
					if (err) return done(err);
					expect(util.checkFileSync('CryptoSync/.encrypted/test.png.crypto')).to.be.false;
					done();
				});
			});
		});
	});
});
