let ssscrypto = require('secrets.js'),
    crypto = require('crypto');

// Crypto default constants
let defaults = {
  iterations: 4096,
  keyLength: 128,
  algorithm: 'aes-256-ctr',
  digest: 'sha256'
}


/*  Crypto
 *
 *  TO DO:
 *  - Implement custom encryption as outlined in the requirement spec
 */

exports.encrypt = function (ptext, password, iterations, keyLength) {
  // decrypts any arbitrary data passed with the pass
  let i = iterations || defaults.iterations,
      kL = keyLength || defaults.keyLength,
      pass = (Array.isArray(password)) ? shares2pass(password) : password;
  const salt = crypto.randomBytes(kL); // generate pseudorandom salt
  const iv = crypto.randomBytes(kL); // generate pseudorandom iv
  return crypto.pbkdf2Sync(pass, salt, i, kL, defaults.digest, function(err, key) {
    if (err){
      throw err;
    }

    let cipher = crypto.createCipheriv(defaults.algorithm, key, iv),
        crypted = cipher.update(ptext,'utf8','hex');
    crypted += cipher.final('hex');
    return [crypted, key, iv];
  });
};

exports.decrypt = function (ctext, key, iv) {
  // encrypts any arbitrary data passed with the pass
  let decipher = crypto.createDecipheriv(defaults.algorithm, key, iv),
      decrypted = decipher.update(ctext,'hex','utf8');
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
