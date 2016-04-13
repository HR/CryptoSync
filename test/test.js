'use strict'
const assert = require('assert')
const path = require('path')
const expect = require('chai').expect
const crypto = require('../src/crypto.js')
const sync = require('../src/sync.js')
const util = require('../src/util')
const Db = require('../src/Db')
const vault = require('../src/vault')
const MasterPassKey = require('../src/_MasterPassKey')
const OAuth = require('../src/OAuth')
const init = require('../init')
// const synker = require('../src/synker')
const MasterPass = require('../src/MasterPass')
// const logger = require('../script/logger')
const GoogleAuth = require('google-auth-library')
// const levelup = require('levelup')
// const sutil = require('util')
const scrypto = require('crypto')
const _ = require('lodash')
const google = require('googleapis')
const fs = require('fs-extra')
const exec = require('child_process').exec

if (!process.env.TRAVIS) {
  require('dotenv')
    .config()
}
console.log(`cwd: ${process.cwd()}`)
console.log(`__dirname: ${__dirname}`)

describe("CryptoSync Core Modules' tests", function () {
  function resetGlobalObj (name) {
    if (name === 'state.queues') {
      global.state.toGet = []
      global.state.toCrypt = []
      global.state.toUpdate = []
      global.state.toPut = []
    } else {
      global[name] = {}
    }
  }

  global.paths = {
    home: path.join(__dirname,'/CryptoSync'),
    crypted: path.join(__dirname,'/CryptoSync/.crypto'),
    mdb: path.join(__dirname,'/tmp/mdb'),
    vault: path.join(__dirname,'/CryptoSync/vault.crypto'),
    tmp: path.join(__dirname,'/tmp'),
    data: path.join(__dirname,'/data')
  }
  console.log(require('util').inspect(global.paths, { depth: null }))


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
  }

  global.vault = {
    'RAND0M-ID3': {
      name: 'crypto',
      id: 22,
      secure: true
    },
    'R3C0M-I4D': {
      name: 'cry9to',
      id: 2090,
      secure: false
    }
  }

  global.creds = {}
  global.state = {}

  // Declare globals
  fs.ensureDirSync(global.paths.tmp)
  global.MasterPassKey = new MasterPassKey(scrypto.randomBytes(global.defaults.keyLength))
  global.mdb = new Db(global.paths.mdb)

  const t1path = `${global.paths.tmp}/test.txt`
  // Before all tests have run
  before(function () {
    const creds = {
      access_token: process.env.access_token,
      token_type: process.env.token_type,
      refresh_token: process.env.refresh_token,
      expiry_date: process.env.expiry_date
    }

    const gAuth = {
      clientId_: process.env.clientId_,
      clientSecret_: process.env.clientSecret_,
      redirectUri_: process.env.redirectUri_,
      credentials: creds
    }

    init.drive(gAuth, true)
      .catch((err) => {
        throw err
      })

    global.rfile = JSON.parse(fs.readFileSync(`${global.paths.data}/rfile.json`, 'utf8'))
    global.files = global.rfile
    global.state.rfs = JSON.parse(fs.readFileSync(`${global.paths.data}/rfs.json`, 'utf8'))

    global.execute = function (command, callback) {
      return new Promise(function (resolve, reject) {
        exec(command, function (err, stdout, stderr) {
          resolve(stdout)
        })
      })
    }
  })

  // After all tests have run
  after(function () {
    fs.removeSync(global.paths.tmp)
    fs.removeSync(global.paths.home)
  })

  /** Crypto module.js
   ******************************/

  describe('Sync module', function () {
    before(function () {})

    describe('getQueue', function () {
      beforeEach(function () {
        fs.removeSync(global.paths.home)
      })
      it('should get file with correct keys', function (done) {
        sync.getQueue.push(global.rfile, function (err, file) {
          if (err) return done(err)
          expect(file)
            .to.include.keys('path')
          expect(util.checkFileSync(`${global.paths.home}/test.png`)).to.be.true
          done()
        })
      })

      it('should throw error for empty file', function (done) {
        sync.getQueue.push({}, function (err, file) {
          expect(err).to.be.an('error')
          expect(err.message).to.equal("File doesn't exist")
          done()
        })
      })

      it('should throw error for undefined file', function (done) {
        sync.getQueue.push(undefined, function (err, file) {
          expect(err).to.be.an('error')
          expect(err.message).to.equal("File doesn't exist")
          done()
        })
      })
    })

    describe('cryptQueue', function () {
      before(function () {
        sync.getQueue.push(global.rfile, function (err, file) {
          if (err) throw err
        })
      })
      beforeEach(function () {
        fs.removeSync(global.paths.crypted)
      })

      it('should with remote (API) file without errors', function (done) {
        sync.cryptQueue.push(global.rfile, function (err, file) {
          if (err) return done(err)
          assert.equal(`${global.paths.crypted}/test.png.crypto`, file.cryptPath)
          done()
        })
      })
      it('should have correct cryptPath', function (done) {
        sync.cryptQueue.push(global.rfile, function (err, file) {
          if (err) return done(err)
          expect(file.cryptPath)
            .to.equal(`${global.paths.crypted}/test.png.crypto`)
          done()
        })
      })
      it('should write to the right location at CryptoSync/.encrypted/', function (done) {
        sync.cryptQueue.push(global.rfile, function (err, file) {
          if (err) return done(err)
          expect(util.checkFileSync(`${global.paths.crypted}/test.png.crypto`))
            .to.be.true
          done()
        })
      })
    })

    describe('Queue promises', () => {
      let rfile
      beforeEach(function () {
        resetGlobalObj('state.queues')
        rfile = _.cloneDeep(global.rfile)
      })
      afterEach(function () {
        resetGlobalObj('state.queues')
      })
      it('should pushGetQueue and then pushCryptQueue then updateStats then updateHash', function () {
        this.timeout(3000)
        global.state.toGet.push(rfile)
        // return global.state.toGet.forEach(function (file) {
        return sync.pushGetQueue(global.state.toGet[0])
          .then((file) => {
            expect(util.checkFileSync(`${global.paths.home}/test.png`)).to.be.true
            expect(global.state.toGet).to.be.empty
            expect(global.state.toCrypt[0].id).to.equal(global.rfile.id)
            expect(global.files[file.id]).to.include.keys('path')
            return file
          })
          .then((file) => {
            return sync.pushCryptQueue(file)
          })
          .then((file) => {
            expect(util.checkFileSync(`${global.paths.crypted}/test.png.crypto`)).to.be.true
            expect(global.state.toCrypt).to.be.empty
            expect(global.state.toUpdate[0].id).to.equal(global.rfile.id)
            expect(global.files[file.id]).to.include.keys('cryptPath')
            return file
          })
          .then((file) => {
            const nfile = _.cloneDeep(file)
            return sync.updateStats(nfile)
          })
          .then((nfile) => {
            return sync.updateHash(nfile)
          })
          .then((nfile) => {
            expect(nfile).to.have.property('md5hash')
            expect(nfile).to.have.property('mtime')
            expect(nfile).to.have.property('size')
            expect(nfile.size).not.to.be.empty
            expect(nfile.mtime).to.be.a('date')
            expect(nfile.md5hash).not.to.be.empty
            return
          })
          // .then((file) => {
          // 	return sync.pushUpdateQueue(file)
          // })
          // .then(() => {
          // 	return sync.updateStatus('put', file)
          // })
          .catch((err) => {
            throw err
          })
      // })
      })
      it('should pushCryptQueue then pushPutQueue when file added', function () {
        this.timeout(3000)

        function getFolderId (path, folders) {
          for (var folder in folders) {
            if (folders[folder].path === path) return folder
          }
        }
        const addedfile = `${global.paths.home}/test2.txt`
        fs.writeFileSync(addedfile, '#CryptoSync', 'utf8')
        const fileName = path.basename(addedfile)
        const rfsPath = util.resolvePath(addedfile)
        expect(rfsPath).to.equal('/')
        const parents = [getFolderId(rfsPath, global.state.rfs)]
        expect(parents[0]).to.equal(Object.keys(global.state.rfs)[0])

        sync.createFileObj(fileName, addedfile, parents)
          .then((file) => {
            expect(file).to.have.all.keys('name', 'path', 'parents')
            global.state.toCrypt.push(file)
            return file
          })
          .then((file) => {
            return sync.pushCryptQueue(file)
          })
          .then((file) => {
            expect(file).to.include.keys('cryptPath')
            expect(global.state.toCrypt).to.be.empty
            expect(global.state.toPut[0].name).to.equal(file.name)
            return sync.pushPutQueue(file)
          })
          .then((file) => {
            expect(global.state.toPut).to.be.empty
            expect(file.id).not.to.be.empty
            return
          })
          .catch((err) => {
            throw err
          })
      })
    })

    describe('Setup', function () {
      before(function () {
        fs.removeSync(global.paths.crypted)
      })

      it("should retrieve the user's account info", function () {
        return sync.getAccountInfo()
          .then((res) => {
            expect(res).to.have.property('user')
            expect(res).to.have.property('storageQuota')
            return
          })
          .catch((err) => {
            throw(err)
          })
      })

      it('should write to the right location at CryptoSync/.encrypted/', function (done) {
        sync.cryptQueue.push(global.rfile, function (err, file) {
          if (err) return done(err)
          expect(util.checkFileSync(`${global.paths.crypted}/test.png.crypto`))
            .to.be.true
          done()
        })
      })
    })
  })

  describe('Synker module', function () {
    before(function () {})
  })

  describe('OAuth2 flow', function () {
    beforeEach(function () {
      global.gAuth = new OAuth('gdrive')
    })
    it('should create correct authUrl', function (done) {
      global.gAuth.authorize(null, function (authUrl) {
        expect(authUrl)
          .to.be.a('string')
        expect(util.getParam('access_type', authUrl))
          .to.equal('offline')
        done()
      })
    })

    it('should follow through OAuth flow', function () {
      after(function () {})
      this.timeout(4000)
      global.accounts = {}
      const auth = new GoogleAuth()
      const b64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/g
      global.gAuth.oauth2Client = new auth.OAuth2(process.env.clientId_, process.env.clientSecret_, process.env.redirectUri_)
      // global.gAuth.getToken(process.env.auth_code) // Get auth token from auth code
      const token = process.env.access_token
      global.gAuth.oauth2Client.credentials = token
      expect(global.gAuth.oauth2Client.credentials)
        .to.equal(token)
      const rfs = _.cloneDeep(global.state.rfs)
      const files = _.cloneDeep(global.files)
      global.state.rfs = {}
      global.files = {}
      // expect(global.drive).to.equal(token)
      return sync.getAccountInfo()
        .then((res) => {
          return sync.getPhoto(res)
        })
        .then((param) => {
          expect(b64Regex.test(param[0]))
            .to.be.true
          expect(param[1].user)
            .to.have.property('displayName')
          return param
        })
        .then((param) => {
          return sync.setAccountInfo(param, global.gAuth)
        })
        .then((email) => {
          return sync.getAllFiles(email)
        })
        .then((trees) => {
          return init.syncGlobals(trees)
        })
        .then((trees) => {
          return global.mdb.storeToken(token)
        })
        .then(() => {
          expect(global.account.oauth)
            .to.have.property('oauth2Client')
          expect(global.account.oauth.oauth2Client.credentials)
            .to.not.be.empty
          expect(global.state.rfs)
            .to.deep.equal(rfs)
          return global.mdb.getValue('gdrive-token')
        })
        .then((dbtoken) => {
          expect(dbtoken)
            .to.equal(JSON.stringify(token))
          expect(global.rfile.id).to.any.equal(global.state.toGet[0].id, global.state.toGet[1].id, global.state.toGet[2].id)
        })
        .catch(function (e) {
          throw e
        })
    })
  })

  /** Crypto module.js
   ******************************/

  describe('Crypto module', function () {
    before(function () {
      fs.writeFileSync(t1path, '#CryptoSync', 'utf8')
    })

    describe('Hashing & deriving', function () {
      const masterpass = 'crypto#101'

      it('should get same digest hash for genFileHash as openssl', function () {
        return crypto.genFileHash(t1path)
          .then((hash) => {
            global.execute(`openssl dgst -md5 ${t1path}`)
              .then((stdout) => {
                let ohash = stdout.replace('MD5(test.txt)= ', '')
                expect(hash)
                  .to.equal(ohash)
                expect(crypto.verifyFileHash(hash, ohash))
                  .to.be.true
                expect(false).to.true
              })
              .catch((err) => {
                throw err
              })
          })
          .catch((err) => {
            throw err
          })
      })

      it('should deriveMasterPassKey using a MasterPass correctly when salt is buffer', function (done) {
        crypto.deriveMasterPassKey(masterpass, null, function (err, dmpkey, dmpsalt) {
          if (err) done(err)
          crypto.deriveMasterPassKey(masterpass, dmpsalt, function (err, mpkey, mpsalt) {
            if (err) done(err)
            expect(dmpkey.toString('hex'))
              .to.equal(mpkey.toString('hex'))
            done()
          })
        })
      })

      it('should deriveMasterPassKey using a MasterPass correctly with persistent salt', function (done) {
        crypto.deriveMasterPassKey(masterpass, null, function (err, dmpkey, dmpsalt) {
          if (err) done(err)
          const pdmpsalt = JSON.parse(JSON.stringify(dmpsalt))
          crypto.deriveMasterPassKey(masterpass, pdmpsalt, function (err, mpkey, mpsalt) {
            if (err) done(err)
            expect(dmpkey.toString('hex'))
              .to.equal(mpkey.toString('hex'))
            done()
          })
        })
      })
    })

    describe('Encryption', function () {
      it('should generate iv, encrypt & decrypt an obj with MPKey when salt is buffer', function (done) {
        const toCryptObj = _.cloneDeep(global.vault)
        const fpath = `${global.paths.tmp}/cryptedObj.crypto`
        crypto.genIV()
          .then(function (viv) {
            crypto.encryptObj(toCryptObj, fpath, global.MasterPassKey.get(), viv, function (err, authTag) {
              if (err) done(err)
              crypto.decryptObj(fpath, global.MasterPassKey.get(), viv, authTag, function (err, devaulted) {
                if (err) done(err)
                expect(devaulted)
                  .to.deep.equal(toCryptObj)
                done()
              })
            })
          })
          .catch((err) => {
            done(err)
          })
      })

      it('should generate iv, encrypt & decrypt vault obj with MPKey with persistent salt', function (done) {
        const toCryptObj = _.cloneDeep(global.vault)
        const fpath = `${global.paths.tmp}/cryptedObj2.crypto`
        crypto.genIV()
          .then(function (viv) {
            const pviv = JSON.parse(JSON.stringify(viv))
            crypto.encryptObj(toCryptObj, fpath, global.MasterPassKey.get(), pviv, function (err, authTag) {
              if (err) done(err)
              crypto.decryptObj(fpath, global.MasterPassKey.get(), viv, authTag, function (err, devaulted) {
                if (err) done(err)
                expect(devaulted)
                  .to.deep.equal(toCryptObj)
                done()
              })
            })
          })
          .catch((err) => {
            done(err)
          })
      })

      it('should encrypt file with pass without errors & have all expected creds', function (done) {
        before(function () {
          fs.writeFileSync(t1path, '#CryptoSync', 'utf8')
        })
        crypto.encrypt(t1path, `${t1path}.crypto`, global.MasterPassKey.get(), function (err, key, iv, tag) {
          if (err) done(err)
          try {
            let file = {}
            file.iv = iv.toString('hex')
            file.authTag = tag.toString('hex')
            done()
          } catch (err) {
            if (err) done(err)
          }
        })
      })

      // it('should encrypt and decrypt file with pass', function (done) {
      // 	let cryptoPath = '${t1path}.crypto'
      // 	crypto.encrypt(t1path, cryptoPath, global.MasterPassKey.get(), function (err, key, iv, tag) {
      // 		if (err) done(err)
      // 		crypto.decrypt(cryptoPath, '${global.paths.tmp}/test2.txt', key, null, null, function (err, iv, tag) {
      // 			if (err) done(err)
      // 			fs.readFile('${global.paths.tmp}/test2.txt', function read(err, data) {
      // 				if (err) done(err)
      // 				expect(data.toString('utf8')).to.equal('#CryptoSync')
      // 				done()
      // 			})
      // 		})
      // 	})
      // })

      it('should convert key to shares and back with shares obj', function (done) {
        const key = scrypto.randomBytes(defaults.keyLength)
          .toString('hex')
        const sharesObj = crypto.pass2shares(key)
        const ckey = crypto.shares2pass(sharesObj)
        const ckeyArray = crypto.shares2pass(sharesObj.data)
        expect(ckey)
          .to.equal(key)
        expect(ckeyArray)
          .to.equal(key)
        done()
      })
    })
  })

  /**
   * vault module.js
   ******************************/
  describe('vault module', function () {
    it('should generate encrypt & decrypt vault obj', function () {
      global.creds.viv = scrypto.randomBytes(defaults.ivLength)
      const beforeEncVault = _.cloneDeep(global.vault)
      return vault.encrypt(global.MasterPassKey.get())
        .then(() => {
          return vault.decrypt(global.MasterPassKey.get())
            .then(() => {
              expect(global.vault)
                .to.deep.equal(beforeEncVault)
            })
            .catch((err) => {
              throw err
            })
        })
        .catch((err) => {
          throw err
        })
    })

    it('should generate iv, encrypt & decrypt vault obj', function () {
      global.creds.viv = null
      return vault.init(global.MasterPassKey.get())
        .then(() => {
          expect(global.creds.viv instanceof Buffer)
            .to.be.true
          expect(global.creds.authTag instanceof Buffer)
            .to.be.true
          return
        })
        .then(() => {
          return vault.decrypt(global.MasterPassKey.get())
        })
        .then(() => {
          expect(global.vault)
            .to.have.property('creationDate')
          return
        })
        .catch((err) => {
          throw (err)
        })
    })

    it('should throw error when authtag is wrong', function () {
      global.creds.viv = scrypto.randomBytes(defaults.ivLength)
      return vault.encrypt(global.MasterPassKey.get())
        .then(() => {
          global.creds.authTag = scrypto.randomBytes(defaults.ivLength)
          return vault.decrypt(global.MasterPassKey.get())
            .catch((err) => {
              expect(err).to.be.an('error')
              expect(err.message).to.equal('Unsupported state or unable to authenticate data')
            })
        })
        .catch((err) => {
          throw err
        })
    })

    it('should throw error when invalid iv length supplied', function () {
      global.creds.viv = scrypto.randomBytes(5)
      return vault.encrypt(global.MasterPassKey.get())
        .catch((err) => {
          expect(err).to.be.an('error')
          expect(err.message).to.equal('Invalid IV length')
        })
    })

  // it('should throw error when iv not initialised', function(done) {
  //	 global.creds.viv = null
  //	 return vault.init(global.MasterPassKey.get(), function(err) {
  //		 expect(err).to.be.an('error')
  //		 expect(err.message).to.equal('Invalid IV length')
  // 		done(err)
  //	 })
  // })
  })

  /**
   * Db module.js
   ******************************/
  describe('Db module', function () {
    let db
    beforeEach(function () {
      db = new Db(`${global.paths.tmp}/db`)
      global.testo = {
        'RAND0M-ID3': {
          name: 'crypto',
          id: 22,
          secure: true
        }
      }
    })
    it('should save and restore obj', function () {
      const beforeSaveObj = _.cloneDeep(global.testo)
      return db.saveGlobalObj('testo')
        .then(() => {
          global.testo = null
          return db.restoreGlobalObj('testo')
        })
        .then(() => {
          expect(global.testo)
            .to.deep.equal(beforeSaveObj)
          db.close()
          return
        })
        .catch((err) => {
          throw (err)
        })
    })

    it('should save and restore obj persistently', function () {
      const beforeSaveObj = _.cloneDeep(global.testo)
      return db.saveGlobalObj('testo')
        .then(() => {
          global.testo = null
          db.close()
          db = new Db(`${global.paths.tmp}/db`)
          return db.restoreGlobalObj('testo')
        })
        .then(() => {
          expect(global.testo)
            .to.deep.equal(beforeSaveObj)
          db.close()
          return
        })
        .catch((err) => {
          throw (err)
        })
    })

    it('should return null if key not found for onlyGetValue', function () {
      return db.onlyGetValue('notExist')
        .then((token) => {
          expect(token)
            .to.equal(null)
          db.close()
        })
    })

    // it('should throw error when global object not exist for restoreGlobalObj', function () {
    //   return db.saveGlobalObj('fake')
    //     .catch((err) => {
    //       expect(false).to.be(true)
    //       expect(err).to.be.an('error')
    //       expect(err.message).to.equal('Unsupported state or unable to authenticate data')
    //       db.close()
    //     })
    // })

  })
  /**
   * Util module.js
   ******************************/
  describe('Util module', function () {
    const t1path = `${global.paths.tmp}/atest.txt`
    const t1data = '#CryptoSync'
    before(function () {
      fs.writeFileSync(t1path, t1data, 'utf8')
    })

    it('should convert ReadableStream into a valid utf-8 string for streamToString', function (done) {
      const readStream = fs.createReadStream(t1path)
      readStream.on('error', (e) => {
        done(e)
      })
      util.streamToString(readStream, function (err, string) {
        if (err) done(err)
        expect(string)
          .to.deep.equal(t1data)
        done()
      })
    })

    it('should parse OAuth url params correctly for getParam', function (done) {
      const url1 = 'https://accounts.google.com/o/oauth2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&response_type=code&client_id=2000868638782-lvmfqubhuv0fv1ld2egyk5sbfvsmvc.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost'
      expect(util.getParam('access_type', url1))
        .to.equal('offline')
      expect(util.getParam('scope', url1))
        .to.equal('https://www.googleapis.com/auth/drive')
      expect(util.getParam('response_type', url1))
        .to.equal('code')
      expect(util.getParam('client_id', url1))
        .to.equal('2000868638782-lvmfqubhuv0fv1ld2egyk5sbfvsmvc.apps.googleusercontent.com')
      expect(util.getParam('redirect_uri', url1))
        .to.equal('http://localhost')
      const url2 = 'http://localhost/?code=4/Ps0nJS352ueSwDn1i5Qzn0KNm-5GDy8Ck-BMaof0#'
      expect(util.getParam('code', url2))
        .to.equal('4/Ps0nJS352ueSwDn1i5Qzn0KNm-5GDy8Ck-BMaof0')
      const url3 = 'http://localhost/?code=access_denied'
      expect(util.getParam('code', url3))
        .to.equal('access_denied')
      done()
    })

    it('should check if file exists', function (done) {
      expect(util.checkFileSync(`${global.paths.data}/rfile.json`))
        .to.be.true
      expect(util.checkFileSync(`${global.paths.data}/rfs.json`))
        .to.be.true
      expect(util.checkDirectorySync(`${global.paths.data}`))
        .to.be.true
      expect(util.checkFileSync(`${global.paths.data}`))
        .to.be.true
      expect(util.checkDirectorySync(`${global.paths.data}/rfs.json`))
        .to.be.true
      expect(util.checkFileSync('any.file'))
        .to.be.false
      expect(util.checkFileSync('anydir/file'))
        .to.be.false
      expect(util.checkFileSync('anydir'))
        .to.be.false
      done()
    })
  })

  /**
   * MasterPass & MasterPassKey module.js
   ******************************/
  describe('MasterPass module', function () {
    it('should set and check masterpass', function (done) {
      const pass = 'V1R3$1NNUM3RI$'
      MasterPass.set(pass, function (err, mpkey) {
        if (err) done(err)
        MasterPass.check(pass, function (err, MATCH, dmpkey) {
          if (err) done(err)
          expect(MATCH)
            .to.be.true
          expect(dmpkey.toString('hex'))
            .to.equal(mpkey.toString('hex'))
          done()
        })
      })
    })

    it('should throw error if not provided or undefined', function (done) {
      const pass = ''
      MasterPass.check(pass, function (err, MATCH, dmpkey) {
        expect(err).to.be.an('error')
        expect(err.message).to.equal('MasterPassKey not provided')
        done()
      })
    })
  })

  describe('MasterPassKey module', function () {
    it('should set and get same masterpasskey', function () {
      const mpkey = scrypto.randomBytes(global.defaults.keyLength)
      const newMPK = scrypto.randomBytes(global.defaults.keyLength)
      const MPK = new MasterPassKey(mpkey)
      expect(MPK.get()).to.deep.equal(mpkey)
      expect(MPK.get() instanceof Buffer).to.be.true
      MPK.set(newMPK)
      expect(MPK.get()).to.deep.equal(newMPK)
    })
    it('should throw error when deleted and get called', function () {
      const mpkey = scrypto.randomBytes(global.defaults.keyLength)
      const MPK = new MasterPassKey(mpkey)
      MPK.delete()
      expect(MPK.get()).to.be.an('error')
      expect(MPK.get().message).to.equal('MasterPassKey is not set')
    })
    it('should throw error when not instantiated with key', function () {
      const MPK = new MasterPassKey()
      expect(MPK.get()).to.be.an('error')
      expect(MPK.get().message).to.equal('MasterPassKey is not set')
    })
  })
})
