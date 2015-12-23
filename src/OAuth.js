'use strict';
// Environment variables
// Google: process.env.CS_GAPI_CID, process.env.CS_GAPI_S
// Dropbox: process.env.CS_DBAPI_KEY, process.env.CS_DBAPI_SKEY
/* TO DO:
 * - Add auth
 */
const app = require('electron').app,
	fs = require('fs'),
	readline = require('readline'),
	google = require('googleapis'),
	googleAuth = require('google-auth-library'),
	SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];


function OAuth(type, secretPath) {
	// TO DO: Check type and accordingly init oauth2
	this.type	= type;
	this.secretPath = secretPath;
	this.oauth2Client;
}

OAuth.prototype.authorize = function(mdb, callback) {
	fs.readFile(this.secretPath, function processClientSecrets(err, content) {
		if (err) {
			console.log('Error loading client secret file: ' + err);
			return;
		}
		// Authorize a client with the loaded credentials, then call the
		// Drive API.
		console.log("Got credentials file content: \n"+content+"\n");
		var credentials = JSON.parse(content).installed,
			clientSecret = credentials.client_secret,
			clientId = credentials.client_id,
			redirectUrl = credentials.redirect_uris[1];
		var auth = new googleAuth();
		OAuth.oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

		mdb.get('gdrive-token', function(err, token) {
			if (err) {
				console.log(err);
				// if (err.notFound) {
				// handle a 'NotFoundError' here
				console.log("TOKEN DOENS'T EXSIT, Calling getNewToken...");
				getNewToken(callback);
				return;
				// }
				// I/O or other error, pass it up the callback
			}
			console.log("TOKEN FOUND: " + token);
			OAuth.oauth2Client.credentials = JSON.parse(token);
			callback();
		});

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
	var authUrl = OAuth.oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES
	});
	// GO TO URL "authUrl" in BrowserWindow to auth user
	callback(authUrl);
}

OAuth.prototype.getToken = function(auth_code, callback) {
	this.oauth2Client.getToken(auth_code, function(err, token) {
		if (err) {
			console.log('Error while trying to retrieve access token' + err);
			return;
		}
		console.log('\nGot the ACCESS_TOKEN: ' + token);
		this.oauth2Client.credentials = token;
		callback(token);
	});
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
