let levelup = require('levelup'),
    fs = require('fs-plus'),
    crypto = require('./crypto');

function Db(file) {
  if (fs.isFileSync(file)) {
    // prompt user for master password and store temporarily (while running)
    fs.readFileSync(file, 'hex', function (err, data) {
      if (err) throw err;
      // decrypt db before opening
      db.decrypt(file, pass);
    });
    return levelup(file);
  } else {
    return levelup(file);
  }
}

/*  Crypto
 *
 *  TO DO:
 *  - Differentiate between MasterPass and secret share as arguments
 *  - Implement treatment accordingly
 */

db.prototype.decrypt = function (file, pass) {
  // decrypt db
  // TO DO;
  let mpass = (Array.isArray(pass)) ? crypto.shares2pass(pass) : pass;
  crypto.decrypt(mpass);
};

db.prototype.encrypt = function (file, pass) {
  // encrypt db
  let mpass = (Array.isArray(pass)) ? crypto.shares2pass(pass) : pass;
  crypto.encrypt(mpass);
};

db.prototype.close = function (file) {
  // encrypt db after closing using the temporarily store MasterPass
  levelup.close();
  fs.readFileSync(file, 'utf8', function (err, data) {
    if (err) throw err;
    db.encrypt(file, pass);
  });
};

module.exports = db;
