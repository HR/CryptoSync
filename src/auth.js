'use strict';
// Environment variables
// Google: process.env.CS_GAPI_CID, process.env.CS_GAPI_S
// Dropbox: process.env.CS_DBAPI_KEY, process.env.CS_DBAPI_SKEY
/* TO DO:
* - Add auth
*/
const fs = require('fs');
const readline = require('readline');
const google = require('googleapis');
const googleAuth = require('google-auth-library');
const paths  = require('../index.js').paths;
let secretPath = paths.userData+'/client_secret.json';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
// const TOKEN_DIR = global.paths.appData + '/.credentials/';
// const TOKEN_PATH = TOKEN_DIR + 'tokens.json';
// Load client secrets from a local file.

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
exports.authorize = function(callback) {
	fs.readFile(secretPath, function processClientSecrets(err, content) {
	  if (err) {
	    console.log('Error loading client secret file: ' + err);
	    return;
	  }
	  // Authorize a client with the loaded credentials, then call the
	  // Drive API.
	  var credentials = JSON.parse(content);
		var clientSecret = credentials.installed.client_secret;
	  var clientId = credentials.installed.client_id;
	  var redirectUrl = credentials.installed.redirect_uris[1];
	  var auth = new googleAuth();
	  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
	});
	// global.mdb.get('credentials', function (err, value) {
  //   if (err) return console.log('Ooops!', err) // likely the key was not found
	//
  //
  //   console.log('name=' + value)
  // })

  // Check if we have previously stored a token.
	global.mdb.get('gdrive-token', function (err, token) {
	  if (err) {
		    if (err.notFound) {
		      // handle a 'NotFoundError' here
					getNewToken(oauth2Client, callback);
		      return;
		    }
		    // I/O or other error, pass it up the callback chain
		    throw err;
		  }
			oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
	});
  // fs.readFile(TOKEN_PATH, function(err, token) {
  //   if (err) {
  //     getNewToken(oauth2Client, callback);
  //   } else {
  //     oauth2Client.credentials = JSON.parse(token);
  //     callback(oauth2Client);
  //   }
  // });
};

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
	// GO TO URL "authUrl" in BrowserWindow to auth user
	callback(authUrl
		// ,
		// function(callback) {
		// oauth2Client.getToken(code, function(err, token) {
	  //   if (err) {
	  //     console.log('Error while trying to retrieve access token', err);
	  //     return;
	  //   }
	  //   oauth2Client.credentials = token;
	  //   // storeToken(token);
	  //   callback(oauth2Client);
	  // });
		// }
	);
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
	db.put('gdrive-token', JSON.stringify(token), function (err) {
	  if (err) throw err; // some kind of I/O error
		console.log('Token stored in mdb');
	});

}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
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
