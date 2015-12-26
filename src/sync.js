'use strict';
let levelup = require('levelup'),
		fs = require('fs-plus'),
		crypto = require('./crypto');

sync.prototype.upload = function(file, account){
	// Code to upload to account
};

sync.prototype.fetchFileList = function(OAuth, pSize){
	// Fetch the entire file list for the account
	if (OAuth.isGDrive) {
		var service = google.drive('v3');
		service.files.list({
			auth: OAuth.oauth2Client,
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
	}
};

sync.prototype.fetchFile = function(file, account){
	// Fetch the file for the specified account
};

module.exports = sync;
