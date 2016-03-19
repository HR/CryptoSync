'use strict';
let levelup = require('levelup'),
	fs = require('fs-plus'),
	_ = require('lodash'),
	google = require('googleapis'),
	crypto = require('./crypto');

function sync(arg) {
	console.log(`Global state: ${arg}`);
	if (global.state.toget) {
		/* TODO: Evaluate the use of async.queues where a queue task is created
				forEach file and the task is to first get the file then encrypt and then
				upload. See if persistently viable (i.e. can continue where left of on
				program restart)
		*/
		async.each(global.state.toget, function (file, callback) {
			let path = `${global.state.rfs[file.parent]['path']}/${file.name}`;
			console.log(`GETing ${file.name} ${file.id} at dest ${path}`);
			// let dest = fs.createWriteStream(path);
			// drive.files.get({
			// 		fileId: file.id,
			// 		alt: 'media'
			// 	})
			// 	.on('end', function () {
			// 		console.log(`GOT ${file.name} ${file.id} at dest ${path}. Moving this file obj to tocrypt`);
			// 		global.state.tocrypt.push(file); // add from tocrypt queue
			// 		_.pull(global.state.toget, file); // remove from toget queue
			callback(null, file.id);
			// 	})
			// 	.on('error', function (fileId, err) {
			// 		console.log('Error during download', err);
			// 		callback();w
			// 	})
			// 	.pipe(dest);
		}, function (err, fileId) {
			// if any of the file processing produced an error, err would equal that error
			if (err) {
				// One of the iterations produced an error.
				// All processing will now stop.
				console.log(`Failed to get ${fileId} at dest, err: ${err}`);
			} else {
				console.log(`GOT ${fileId}. Moving this file obj to tocrypt`);
			}
		});
		// var fileId = '0BwwA4oUTeiV1UVNwOHItT0xfa2M';
		// var dest = fs.createWriteStream('/tmp/photo.jpg');
		// drive.files.get({
		// 		fileId: fileId,
		// 		alt: 'media'
		// 	})
		// 	.on('end', function () {
		// 		console.log('Done');
		// 	})
		// 	.on('error', function (err) {
		// 		console.log('Error during download', err);
		// 	})
		// 	.pipe(dest);
	}
}

sync.prototype.upload = function (file, account) {
	// Code to upload to account
};

sync.prototype.fetchFileList = function (OAuth, pSize) {
	// Fetch the entire file list for the account
	if (OAuth.isGDrive) {
		var service = google.drive('v2');
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

sync.prototype.fetchFile = function (file, account) {
	// Fetch the file for the specified account
};

module.exports = sync;
