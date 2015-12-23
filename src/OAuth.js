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
	rconsole = require('electron').remote.getGlobal("console"),
	SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];


function OAuth(type, secretPath) {
	// Initialize necessary methods/properties from levelup in this instance
	this.type	= type;
	this.secretPath = secretPath;
}

OAuth.prototype.authorize = function(mdb, callback) {
	fs.readFile(this.secretPath, function processClientSecrets(err, content) {
		if (err) {
			rconsole.log('Error loading client secret file: ' + err);
			return;
		}
		// Authorize a client with the loaded credentials, then call the
		// Drive API.
		rconsole.log("Got credentials file content: \n"+content+"\n");
		var credentials = JSON.parse(content).installed,
			clientSecret = credentials.client_secret,
			clientId = credentials.client_id,
			redirectUrl = credentials.redirect_uris[1];
		var auth = new googleAuth();
		OAuth.prototype.oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
		OAuth.prototype.auth = auth;

		mdb.get('gdrive-token', function(err, token) {
			if (err) {
				rconsole.log(err);
				// if (err.notFound) {
				// handle a 'NotFoundError' here
				rconsole.log("TOKEN DOENS'T EXSIT, Calling getNewToken...");
				getNewToken(this.oauth2Client, callback);
				return;
				// }
				// I/O or other error, pass it up the callback
			}
			rconsole.log("TOKEN FOUND: " + token);
			this.oauth2Client.credentials = JSON.parse(token);
			callback(this.oauth2Client);
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
	var authUrl = this.oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES
	});
	// GO TO URL "authUrl" in BrowserWindow to auth user
	callback(authUrl);
}

OAuth.prototype.getToken = function(auth_code, callback) {
	this.oauth2Client.getToken(auth_code, function(err, token) {
		if (err) {
			rconsole.log('Error while trying to retrieve access token' + err);
			return;
		}
		rconsole.log('\nGot the ACCESS_TOKEN: ' + token);
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
		rconsole.log('Token stored in mdb');
	});
};

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
			rconsole.log('The API returned an error: ' + err);
			return;
		}
		var files = response.files;
		if (files.length == 0) {
			rconsole.log('No files found.');
		} else {
			rconsole.log('Files:');
			for (var i = 0; i < files.length; i++) {
				var file = files[i];
				rconsole.log('%s (%s)', file.name, file.id);
			}
		}
	});
}

module.exports = OAuth;
