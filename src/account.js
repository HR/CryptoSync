`use strict`;
/**
 * account.js
 * User accounts
 ******************************/

const dropbox = require(`dropbox`),
	google = require(`googleapis`),
	googleAuth = require(`google-auth-library`),
	request = require(`request`);

	/**
	 * Get and store new token after prompting for user authorization, and then
	 * execute the given callback with the authorized OAuth2 client.
	 *
	 * @param {google.auth.OAuth2} this.oauth2Client The OAuth2 client to get token for.
	 * @param {getEventsCallback} callback The callback to call with the authorized
	 *		 client.
	 */
function account(type, name, profileImg, oauth) {
	this.type = type;
	this.name = name;
	this.profileImg = profileImg;
	this.oauth = oauth;
}
