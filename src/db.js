let levelup = require('levelup'),
    fs = require('fs-plus'),
    crypto = require('./crypto');

function Db(file) {
  if (fs.isFileSync(file)) {
    // prompt user for master password and store temporarily (while running)
    fs.readFileSync(file, 'hex', function (err, data) {
      if (err) throw err;
      // decrypt Db before opening
      Db.decrypt(file, pass);
    });
    return levelup(file);
  } else {
    // Invoke SetMasterPass routine
    return levelup(file);
  }
}

/*  Crypto
 *
 *  TO DO:
 *  - Differentiate between MasterPass and secret share as arguments
 *  - Implement treatment accordingly
 */

Db.prototype.decrypt = function (file, pass) {
  // decrypt Db
  // TO DO;
  let mpass = (Array.isArray(pass)) ? crypto.shares2pass(pass) : pass;
  crypto.decrypt(mpass);
};

Db.prototype.encrypt = function (file, pass) {
  // encrypt Db
  let mpass = (Array.isArray(pass)) ? crypto.shares2pass(pass) : pass;
  crypto.encrypt(mpass);
};

Db.prototype.close = function (file) {
  // encrypt Db after closing using the temporarily store MasterPass
  levelup.close();
  fs.readFileSync(file, 'utf8', function (err, data) {
    if (err) throw err;
    Db.encrypt(file, pass);
  });
};

module.exports = Db;
