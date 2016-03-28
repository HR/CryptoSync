'use strict';
let levelup = require('levelup'),
	fs = require('fs-plus'),
	_ = require('lodash'),
	google = require('googleapis'),
	EventEmitter = require('events'),
	crypto = require('./crypto');

class SyncEmitter extends EventEmitter {};

module.exports = class Sync {
	static event() {
		return new SyncEmitter();
	}
};

// async.each(global.state.toput, function (file, callback) {
// 	if (err) callback(err);
// 	let parent = file.parents[0];
// 	console.log(`TO PUT: ${file.name} (${file.id})`);
// 	global.drive.files.create({
// 		resource: {
// 			name: `lol${file.name}`,
// 		},
// 		media: {
// 			body: fs.createReadStream(file.cryptPath)
// 		},
// 	}, function (err, response) {
// 		if (err) {
// 			return callback(err);
// 		}
// 			return callback(err, rfile, file.id, file.name);
// 	});
// }, function (err, rfile, fileId, fileName) {
// 	if (err) {
// 		console.error(`Failed to PUT file ${fileName} (${fileId}), err: ${err.stack}`);
// 	} else {
// 		console.log(`ENCRYTPTED: ${fileName} (${fileId})`);
// 	}
// });

// global.drive.files.create({
// 	resource: {
// 		name: `${file.name}`,
// 	},
// 	media: {
// 		body: fs.createReadStream(file.cryptPath)
// 	},
// }, function (err, response) {
// 	if (err) {
// 		return console.error(`Error occured while PUTing file ${err.stack}`);
// 	}
// 	console.log(`UPLOADED TEST, response: ${JSON.stringify(response)}`);
// });
// global.drive.files.update({
// 	fileId: file.id,
// 	resource: {
// 		name: `${file.name}.crypto`
// 	},
// 	appProperties: {
// 		CryptoSync: true
// 	},
// 	media: {
// 		mimeType: "application/octet-stream",
// 		body: fs.createReadStream(file.cryptPath)
// 	},
// }, function (err, response) {
// 	if (err) {
// 		return console.error(`Error occurred while PUTing file ${file.name} (${file.id}) to ${file.cryptPath}\n${err.stack}`);
// 	}
// 	console.log(`UPDATED ${file.name} (${file.id}), response: ${JSON.stringify(response)}`);
// });
