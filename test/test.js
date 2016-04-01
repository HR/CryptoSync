'use strict';
const assert = require('assert'),
	expect = require("chai").expect,
	crypto = require('../src/crypto.js'),
	sync = require('../src/sync.js'),
	util = require('../src/util'),
	Db = require('../src/Db'),
	Vault = require('../src/Vault'),
	init = require('../src/init'),
	MasterPass = require('../src/MasterPass'),
	levelup = require('levelup'),
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

	// Before all tests have run
	before(function () {
		// create temp dir
		fs.ensureDirSync('tmp');

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
			mdb: `CryptoSync/mdb`,
			vault: `CryptoSync/vault.crypto`,
		};

		// global.mdb = new Db(global.paths.mdb);

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
		global.creds = {};
		global.MasterPassKey = require('../src/_MasterPassKey');
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

		global.execute = function (command, callback) {
			exec(command, function (error, stdout, stderr) {
				callback(stdout);
			});
		};
	});

	// After all tests have run
	after(function () {
		fs.removeSync('tmp');
		fs.removeSync('CryptoSync');
	});


	/** Crypto module.js
	 ******************************/

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

	/** Crypto module.js
	 ******************************/

	describe('Crypto module', function () {
		const t1path = 'tmp/test.txt';
		before(function () {
			fs.writeFileSync(t1path, '#CryptoSync', 'utf8');
		});

		describe('Hashing & deriving', function () {
			const masterpass = "crypto#101";

			it('should get same digest hash for genFileHash as openssl', function (done) {
				crypto.genFileHash(t1path, function (err, hash) {
					if (err) done(err);
					global.execute(`openssl dgst -md5 ${t1path}`, function (stdout, err, stderr) {
						if (err !== null) done(err);
						// if (stderr !== null) done(stderr);
						let ohash = stdout.replace('MD5(test.txt)= ', '');
						expect(hash).to.equal(ohash);
						expect(crypto.verifyFileHash(hash, ohash)).to.be.true;
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
			it('should generate iv, encrypt & decrypt an obj with MPKey when salt is buffer', function (done) {
				const toCryptObj = _.cloneDeep(global.vault);
				const fpath = 'tmp/cryptedObj.crypto';
				crypto.genIV().then(function (viv) {
					crypto.encryptObj(toCryptObj, fpath, global.MasterPassKey.get(), viv, function (err, authTag) {
						if (err) done(err);
						crypto.decryptObj(fpath, global.MasterPassKey.get(), viv, authTag, function (err, devaulted) {
							if (err) done(err);
							expect(devaulted).to.deep.equal(toCryptObj);
							done();
						});
					});
				}).catch((err) => {
					done(err);
				});
			});

			it('should generate iv, encrypt & decrypt vault obj with MPKey with persistent salt', function (done) {
				const toCryptObj = _.cloneDeep(global.vault);
				const fpath = 'tmp/cryptedObj2.crypto';
				crypto.genIV().then(function (viv) {
					const pviv = JSON.parse(JSON.stringify(viv));
					crypto.encryptObj(toCryptObj, fpath, global.MasterPassKey.get(), pviv, function (err, authTag) {
						if (err) done(err);
						crypto.decryptObj(fpath, global.MasterPassKey.get(), viv, authTag, function (err, devaulted) {
							if (err) done(err);
							expect(devaulted).to.deep.equal(toCryptObj);
							done();
						});
					});
				}).catch((err) => {
					done(err);
				});
			});

			it('should encrypt file with pass without errors & have all expected creds', function (done) {
				before(function () {
					fs.writeFileSync(t1path, '#CryptoSync', 'utf8');
				});
				crypto.encrypt(t1path, `${t1path}.crypto`, global.MasterPassKey.get(), function (err, key, iv, tag) {
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
			// 	let cryptoPath = '${t1path}.crypto';
			// 	crypto.encrypt(t1path, cryptoPath, global.MasterPassKey.get(), function (err, key, iv, tag) {
			// 		if (err) done(err);
			// 		crypto.decrypt(cryptoPath, 'tmp/test2.txt', key, null, null, function (err, iv, tag) {
			// 			if (err) done(err);
			// 			fs.readFile('tmp/test2.txt', function read(err, data) {
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

	/**
	 * Vault module.js
	 ******************************/
	describe('Vault module', function () {
		it('should generate encrypt & decrypt vault obj', function (done) {
			global.creds.viv = scrypto.randomBytes(defaults.ivLength);
			const beforeEncVault = _.cloneDeep(global.vault);
			Vault.encrypt(global.MasterPassKey.get())
				.then(Vault.decrypt(global.MasterPassKey.get()))
				.then(() => {
					expect(global.vault).to.deep.equal(beforeEncVault);
					done();
				}).catch((err) => {
					done(err);
				});
		});

		it('should generate iv, encrypt & decrypt vault obj', function (done) {
			global.creds.viv = null;
			Vault.init(global.MasterPassKey.get(), function (err) {
				if (err) done(err);
				expect(global.creds.viv instanceof Buffer).to.be.true;
				expect(global.creds.authTag instanceof Buffer).to.be.true;
				Vault.decrypt(global.MasterPassKey.get())
					.then(() => {
						expect(global.vault).to.have.property('creationDate');
						done();
					}).catch((err) => {
						done(err);
					});
			});
		});
	});

	/**
	 * Db module.js
	 ******************************/
	describe('Db module', function () {
		let db;
		beforeEach(function () {
			db = new Db('tmp/db');
			global.testo = {
				"RAND0M-ID3": {
					name: 'crypto',
					id: 22,
					secure: true
				}
			};
		});
		it('should save and restore obj', function (done) {
			const beforeSaveObj = _.cloneDeep(global.testo);
			db.saveGlobalObj('testo')
				.then(() => {
					global.testo = null;
					db.restoreGlobalObj('testo').then(() => {
						expect(global.testo).to.deep.equal(beforeSaveObj);
						db.close();
						done();
					});
				})
				.catch((err) => {
					done(err);
				});
		});
		it('should save and restore obj persistently', function (done) {
			const beforeSaveObj = _.cloneDeep(global.testo);
			db.saveGlobalObj('testo')
				.then(() => {
					global.testo = null;
					db.close();
					db = new Db('tmp/db');
					db.restoreGlobalObj('testo').then(() => {
						expect(global.testo).to.deep.equal(beforeSaveObj);
						db.close();
						done();
					});
				})
				.catch((err) => {
					done(err);
				});
		});
	});
	/**
	 * Util module.js
	 ******************************/
	describe('Util module', function () {
		const t1path = 'tmp/atest.txt';
		const t1data = '#CryptoSync';
		before(function () {
			fs.writeFileSync(t1path, t1data, 'utf8');
		});

		it('should convert ReadableStream into a valid utf-8 string for streamToString', function (done) {
			const readStream = fs.createReadStream(t1path);
			readStream.on('error', (e) => {
				done(e);
			});
			util.streamToString(readStream, function (err, string) {
				if (err) done(err);
				expect(string).to.deep.equal(t1data);
				done();
			});
		});

		it('should parse OAuth url params correctly for getParam', function (done) {
			const url1 = 'https://accounts.google.com/o/oauth2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&response_type=code&client_id=2000868638782-lvmfqubhuv0fv1ld2egyk5sbfvsmvc.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost';
			expect(util.getParam('access_type', url1)).to.equal('offline');
			expect(util.getParam('scope', url1)).to.equal('https://www.googleapis.com/auth/drive');
			expect(util.getParam('response_type', url1)).to.equal('code');
			expect(util.getParam('client_id', url1)).to.equal('2000868638782-lvmfqubhuv0fv1ld2egyk5sbfvsmvc.apps.googleusercontent.com');
			expect(util.getParam('redirect_uri', url1)).to.equal('http://localhost');
			const url2 = 'http://localhost/?code=4/Ps0nJS352ueSwDn1i5Qzn0KNm-5GDy8Ck-BMaof0#';
			expect(util.getParam('code', url2)).to.equal('4/Ps0nJS352ueSwDn1i5Qzn0KNm-5GDy8Ck-BMaof0');
			const url3 = 'http://localhost/?code=access_denied';
			expect(util.getParam('code', url3)).to.equal('access_denied');
			done();
		});

		it('should check if file exists', function (done) {
			expect(util.checkFileSync('data/rfile.json')).to.be.true;
			expect(util.checkFileSync('data/rfs.json')).to.be.true;
			expect(util.checkDirectorySync('data')).to.be.true;
			expect(util.checkFileSync('data')).to.be.true;
			expect(util.checkDirectorySync('data/rfs.json')).to.be.true;
			expect(util.checkFileSync('any.file')).to.be.false;
			expect(util.checkFileSync('anydir/file')).to.be.false;
			expect(util.checkFileSync('anydir')).to.be.false;
			done();
		});
	});

	/**
	 * MasterPass module.js
	 ******************************/
	describe('MasterPass module', function () {
		it('should set and check masterpass', function (done) {
			const pass = 'V1R3$1NNUM3RI$';
			MasterPass.set(pass, function (err, mpkey) {
				if (err) done(err);
				MasterPass.check(pass, function (err, MATCH, dmpkey) {
					if (err) done(err);
					expect(MATCH).to.be.true;
					expect(dmpkey.toString('hex')).to.equal(mpkey.toString('hex'));
					done();
				});
			});
		});
	});
});
