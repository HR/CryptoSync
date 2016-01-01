`use strict`;
/**
 * Account.js
 * User accounts
 ******************************/

const dropbox = require(`dropbox`),
	google = require(`googleapis`),
	googleAuth = require(`google-auth-library`),
	request = require(`request`);

	/**
	 * Constructor
	 *
	 * @param {type}:string the cloud service provider
	 * @param {name}:string the name of the authenticated user
	 * @param {email}:string the email of the authenticated user
	 * @param {profileImg}:string base64 encoded profile image
	 * @param {qouta}:string the qouta of the authenticated user
	 * @param {oauth}:object the authenticated oauth2Client
	 */
function Account(type, name, email, profileImg, qouta, oauth) {
	this.type = type;
	this.name = name;
	this.email = email;
	this.profileImg = profileImg;
	this.qouta = qouta;
	this.oauth = oauth;
}

Account.prototype.fetchFileList = function(pSize){
	// Fetch the entire file list for the account
	console.log("Called fetchFileList");
	var self = this;
	var service = google.drive('v2');
	service.files.list({
		auth: self.oauth,
		pageSize: pSize || 10,
		fields: 'nextPageToken, files(id, name)'
	}, function (err, response) {
		if (err) {
			console.log(`The API returned an error: ${err}`);
			return;
		}
		var files = response.files;
		if (files.length == 0) {
			console.log(`No files found.`);
		} else {
			console.log(`Files:`);
			for (var i = 0; i < files.length; i++) {
				var file = files[i];
				console.log(`%s (%s)`, file.name, file.id);
			}
		}
		});
};

module.exports = Account;
