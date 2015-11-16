let ssscrypto = require('secrets.js'),
    crypto = require('crypto');

const cAlg = 'aes-256-ctr';

/*  Crypto
 *
 *  TO DO:
 *  - Implement custom encryption as outlined in the requirement spec
 */

exports.encrypt = function (ptext, pass) {
  // decrypts any arbitrary data passed with the pass
  var cipher = crypto.createCipher(cAlg, pass),
      crypted = cipher.update(ptext,'utf8','hex');
  crypted += cipher.final('hex');
  return crypted;
};

exports.decrypt = function (ctext, pass) {
  // encrypts any arbitrary data passed with the pass
  var decipher = crypto.createDecipher(cAlg, pass),
      decrypted = decipher.update(ptext,'hex','utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

exports.shares2pass = function (shares) {
  // reconstructs the pass from the shares of the pass
  // using Shamir's Secret Sharing
  /*  TO DO:
   *  Parsing shares[type = Array]:
   *  - Slice array from [Array.length-2:Array.length] to extract the metadata
   *    i.e. number of shares required (S) and total number originally generated (N)
   *  - Slice array from [0:Array.length-2] to extract the shares
   *  - shares = ["s1", "s2",..., "sS", "S", "N"]
   **/
  return null;
};

exports.pass2shares = function (shares) {
  // splits the pass into shares using Shamir's Secret Sharing
  /*  TO DO:
   *  Parsing shares[type = Array]:
   *  - Slice array from [Array.length-2:Array.length] to extract the metadata
   *    i.e. number of shares required and total number originally generated
   *  - Slice array from [0:Array.length-2] to extract the shares
   *  - shares = ["MasterPass", "S", "N"]
   **/
  return null;
};
