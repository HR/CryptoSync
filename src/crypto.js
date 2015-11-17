let ssscrypto = require('secrets.js'),
    crypto = require('crypto');

// Crypto default constants
let defaults = {
  iterations: 4096,
  keyLength: 128,
  algorithm: 'aes-256-ctr',
  digest: 'sha256',
  padLength: 1024
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

exports.shares2pass = function (sharedata) {
  // reconstructs the pass from the shares of the pass
  // using Shamir's Secret Sharing
  /*  TO DO:
   *  Parsing shares[type = Array]:
   *  - Slice array from [Array.length-2:Array.length] to extract the metadata
   *  - Slice array from [0:Array.length-2] to extract the shares
   *  - shares = ["s1", "s2",..., "sS", "S", "N"]
   *  - N = total number of shares originally generated
   *  - S = number of shares (threshold) required to reconstruct key and decrypt
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
  /*  TO DO:
   *  Parsing shares[type = Array]:
   *  - Slice array from [Array.length-2:Array.length] to extract the metadata
   *    i.e. number of shares required and total number originally generated
   *  - Slice array from [0:Array.length-2] to extract the shares
   *  - shares = ["MasterPass", "S", "N"]
   **/
  // convert the text into a hex string
  let pwHex = secrets.str2hex(pass);

  // split into N shares, with a threshold of S
  // Zero padding of defaults.padLength applied to ensure minimal info leak (i.e size of pass)
  let shares = secrets.share(key, N, S, defaults.padLength);
  return [shares, N, S];
};
