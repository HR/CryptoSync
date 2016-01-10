`use strict`;
/**
 * OAuth.js
 * Establish a authorised OAuth 2 client
 ******************************/


/* TODO:
 * - Add auth
 */
const fs = require(`fs`),
	dropbox = require(`dropbox`),
	google = require(`googleapis`),
	googleAuth = require(`google-auth-library`),
	request = require(`request`),
	SCOPES = [`https://www.googleapis.com/auth/drive`];


function OAuth(type, secretPath) {
	// TODO: Check type and accordingly init oauth2
	this.type = type;
	this.secretPath = secretPath;
	this.oauth2Client;
	this.isGDrive = Boolean(type === 'gdrive'); // Cloud type flag
	// prr(OAuth, 'isGDrive', 'bar');
}

OAuth.prototype.authorize = function (mdb, callback) {
	var self = this;
	fs.readFile(this.secretPath, function (err, content) {
		if (err) {
			console.log(`Error loading client secret file: ${err}`);
			return;
		}
		// Authorize a client with the loaded credentials, then call the
		// Drive API.
		console.log(`Got credentials file content: \n ${content} \n`);
		console.log(`Is gdrive: ${self.isGDrive}`);
		if (self.isGDrive) {
			// Google Drive Auth
			console.log(`Google Drive auth initiated`);
			var credentials = JSON.parse(content).gdrive;
			var auth = new googleAuth();
			self.oauth2Client = new auth.OAuth2(credentials.client_id, credentials.client_secret, credentials.redirect_uris[1]);

			mdb.get('gdrive-token', function (err, token) {
				if (err) {
					console.log(err);
					// if (err.notFound) {
					// handle a `NotFoundError` here
					console.log(`TOKEN DOES NOT EXIST, Calling getNewToken...`);
					getNewToken(self, callback);
					return;
					// }
					// I/O or other error, pass it up the callback
				}
				console.log(`TOKEN FOUND: ` + token);
				self.oauth2Client.credentials = JSON.parse(token);
				callback();
			});
		} else {
			// Drobpox Auth
			console.log(`Dropbox auth initiated`);
			var credentials = JSON.parse(content).dropbox;
			self.oauth2Client = new dropbox.Client({
				key: credentials.client_id,
				secret: credentials.client_secret
			});
			mdb.get('dropbox-token', function (err, token) {
				if (err) {
					console.log(err);
					// if (err.notFound) {
					// handle a `NotFoundError` here
					console.log(`TOKEN DOES NOT EXIST, Calling getNewToken...`);
					getNewToken(self, callback);
					return;
					// }
					// I/O or other error, pass it up the callback
				}
				console.log(`TOKEN FOUND: ${token}`);
				self.oauth2Client.credentials = JSON.parse(token);
				callback();
			});
		}
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
function getNewToken(self, callback) {
	console.log(`getNewToken, isGDrive = ${self.isGDrive}`);
	if (self.isGDrive) {
		var authUrl = self.oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: SCOPES
		});
		// GO TO URL `authUrl` in BrowserWindow to auth user
		callback(authUrl);
	} else {
		// TODO: IMPLEMENT .generateAuthUrl in /dropbox/src/
		self.oauth2Client.generateAuthUrl(function (authUrl) {

		});
	}
}

OAuth.prototype.getToken = function (auth_code, callback) {
	var self = this;
	if (this.isGDrive) {
		// Google Drive
		console.log(`gDrive getToken`);
		this.oauth2Client.getToken(auth_code, function (err, token) {
			if (err) {
				console.log(`Error while trying to retrieve access token ${err}`);
				return;
			}
			console.log(`Got the ACCESS_TOKEN: ${token}`);
			self.oauth2Client.credentials = token;
			callback(token);
		});
	} else {
		// Drobpox
		console.log(`Drobpox getToken`);
	}
};

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */

OAuth.prototype.storeToken = function (token, mdb) {
	mdb.put('gdrive-token', JSON.stringify(token), function (err) {
		if (err) throw err; // some kind of I/O error
		console.log(`Token stored in mdb`);
	});
};

module.exports = OAuth;
