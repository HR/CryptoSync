'use strict';
// Environment variables
// Google: process.env.CS_GAPI_CID, process.env.CS_GAPI_S
// Dropbox: process.env.CS_DBAPI_KEY, process.env.CS_DBAPI_SKEY
/* TO DO:
 * - Add auth
 */
const fs = require('fs'),
  dropbox = require("dropbox"),
  google = require('googleapis'),
  googleAuth = require('google-auth-library'),
  request = require('request'),
  SCOPES = ['https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];


function OAuth(type, secretPath) {
  // TO DO: Check type and accordingly init oauth2
  this.type = type;
  this.secretPath = secretPath;
  this.oauth2Client;
  this.isGDrive = Boolean(type === "gdrive"); // Cloud type flag
}

OAuth.prototype.authorize = function(mdb, callback) {
  fs.readFile(this.secretPath, function(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    // Authorize a client with the loaded credentials, then call the
    // Drive API.
    console.log("Got credentials file content: \n" + content + "\n");
		// TO DO: Fix OAuth.isGDrive === undefined issue
		console.log("Is gdrive: "+OAuth.isGDrive);
    if (true) {
      // Google Drive Auth
			console.log("Google Drive auth initiated");
      var credentials = JSON.parse(content).gdrive;
      var auth = new googleAuth();
      OAuth.oauth2Client = new auth.OAuth2(credentials.client_id, credentials.client_secret, credentials.redirect_uris[1]);

      mdb.get('gdrive-token', function(err, token) {
        if (err) {
          console.log(err);
          // if (err.notFound) {
          // handle a 'NotFoundError' here
          console.log("TOKEN DOENS'T EXIST, Calling getNewToken...");
          getNewToken(callback);
          return;
          // }
          // I/O or other error, pass it up the callback
        }
        console.log("TOKEN FOUND: " + token);
        OAuth.oauth2Client.credentials = JSON.parse(token);
        callback();
      });
    } else {
			return;
      // Drobpox Auth
			console.log("Dropbox auth initiated");
      var credentials = JSON.parse(content).dropbox;
      OAuth.oauth2Client = new dropbox.Client({
        key: credentials.client_id,
        secret: credentials.client_secret
      });
      mdb.get('dropbox-token', function(err, token) {
        if (err) {
          console.log(err);
          // if (err.notFound) {
          // handle a 'NotFoundError' here
          console.log("TOKEN DOENS'T EXIST, Calling getNewToken...");
          getNewToken(callback);
          return;
          // }
          // I/O or other error, pass it up the callback
        }
        console.log("TOKEN FOUND: " + token);
        OAuth.oauth2Client.credentials = JSON.parse(token);
        callback();
      });
    }


    // Check if we have previously stored a token.

    // fs.readFile(TOKEN_PATH, function(err, token) {
    //	 if (err) {
    //		 getNewToken(this.oauth2Client, callback);
    //	 } else {
    //		 this.oauth2Client.credentials = JSON.parse(token);
    //		 callback(this.oauth2Client);
    //	 }
    // });
  });
};

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} this.oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *		 client.
 */
function getNewToken(callback) {
  if (true) {
    var authUrl = OAuth.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });
    // GO TO URL "authUrl" in BrowserWindow to auth user
    callback(authUrl);
  } else {
		// TO DO: IMPLEMENT .generateAuthUrl in /dropbox/src/
    OAuth.oauth2Client.generateAuthUrl(function(authUrl) {

    });
  }
}

OAuth.prototype.getToken = function(auth_code, callback) {
  if (true) {
    // Google Drive
    OAuth.oauth2Client.getToken(auth_code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token' + err);
        return;
      }
      console.log('\nGot the ACCESS_TOKEN: ' + token);
      OAuth.oauth2Client.credentials = token;
      callback(token);
    });
  } else {
    // Drobpox

  }
};

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */

OAuth.prototype.storeToken = function(token, mdb) {
  mdb.put('gdrive-token', JSON.stringify(token), function(err) {
    if (err) throw err; // some kind of I/O error
    console.log('Token stored in mdb');
  });
};

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * i.e. oauth2Client
 */
function listFiles(auth) {
  var service = google.drive('v3');
  service.files.list({
    auth: auth,
    pageSize: 10,
    fields: "nextPageToken, files(id, name)"
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var files = response.files;
    if (files.length == 0) {
      console.log('No files found.');
    } else {
      console.log('Files:');
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        console.log('%s (%s)', file.name, file.id);
      }
    }
  });
}

module.exports = OAuth;
