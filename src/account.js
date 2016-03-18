`use strict`;
/**
 * Account.js
 * User accounts
 ******************************/

const google = require('googleapis'),
	googleAuth = require('google-auth-library'),
	request = require('request');

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
function Account(type, name, email, profileImg, quota, oauth) {
	this.type = type;
	this.name = name;
	this.email = email;
	this.profileImg = profileImg;
	this.quota = quota;
	this.oauth = oauth;
	// TODO: Implement qouta functionality
	// this.qouta = qouta;
}

Account.prototype.fetchFileList = function (pSize) {
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

// var fetchPage = function (pageToken, pageFn, callback) {
// 	drive.files.list({
// 		q: "mimeType='image/jpeg'",
// 		fields: 'nextPageToken, files(id, name)',
// 		spaces: 'drive',
// 		pageToken: pageToken
// 	}, function (err, res) {
// 		if (err) {
// 			callback(err);
// 		} else {
// 			res.files.forEach(function (file) {
// 				console.log('Found file: ', file.name, file.id);
// 			});
// 			if (res.nextPageToken) {
// 				console.log("Page token", res.nextPageToken);
// 				pageFn(res.nextPageToken, pageFn, callback);
// 			} else {
// 				callback();
// 			}
// 		}
// 	});
// };
// fetchPage(null, fetchPage, function (err) {
// 	if (err) {
// 		// Handle error
// 		console.log(err);
// 	} else {
// 		// All pages fetched
// 	}
// });

module.exports = Account;
