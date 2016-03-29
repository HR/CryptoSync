'use strict';
/**
 * sync.js
 * Main cloud sync functionality
 ******************************/

let levelup = require('levelup'),
	fs = require('fs-extra'),
	_ = require('lodash'),
	google = require('googleapis'),
	moment = require('moment'),
	EventEmitter = require('events').EventEmitter,
	crypto = require('./crypto'),
	async = require('async');

const API_REQ_LIMIT = 7;
// class SyncEmitter extends EventEmitter {};

exports.event = new EventEmitter();

// Sync.getAll(global.state.toget, global.drive.files, global.state.rfs);
exports.getAll = function (cb) {
	// const self = this;
	async.eachLimit(global.state.toget, API_REQ_LIMIT, function (file, callback) {
		if (!file) return;
		let parentPath = global.state.rfs[file.parents[0]].path;
		let dir = `${global.paths.home}${parentPath}`;
		// TODO: replace with mkdirp
		fs.mkdirs(dir, function (err) {
			if (err) callback(err);
			let path = (parentPath === "/") ? `${dir}${file.name}` : `${dir}/${file.name}`;
			console.log(`GETing ${file.name} at dest ${path}`);
			let dest = fs.createWriteStream(path);
			// TODO: figure out a better way of limiting API requests to less than 10/s (Google API limit)

			global.drive.files.get({
					fileId: file.id,
					alt: 'media'
				})
				.on('error', function (err) {
					console.log('Error during download', err);
					callback(err);
				})
				.on('end', function () {
					console.log(`GOT ${file.name} ${file.id} at dest ${path}. Moving this file obj to tocrypt`);
					// global.state.tocrypt.push(file); // add from tocrypt queue
					// _.pull(global.state.toget, file); // remove from toget queue
					// self.event.emit('got', file);
					callback();
				})
				.pipe(dest);

		});
	}, function (err) {
		cb(err);
	});
};

exports.cryptAll = function (cb) {
	// const self = this;
	fs.mkdirs(global.paths.crypted, function (err) {
		async.each(global.state.tocrypt, function (file, callback) {
			if (err) callback(err);
			if (!file) return;
			let parentPath = global.state.rfs[file.parents[0]].path;
			let origpath = (parentPath === "/") ? `${global.paths.home}${parentPath}${file.name}` : `${global.paths.home}${parentPath}/${file.name}`;
			let destpath = `${global.paths.crypted}/${file.name}.crypto`;
			console.log(`TO ENCRYTPT: ${file.name} (${file.id}) at origpath: ${origpath} to destpath: ${destpath} with parentPath ${parentPath}`);
			crypto.encrypt(origpath, destpath, global.MasterPass.get(), function (err, key, iv, tag) {
				if (err) {
					return callback(err);
				} else {
					try {
						file.cryptPath = destpath;
						file.iv = iv.toString('hex');
						file.authTag = tag.toString('hex');
						global.vault[file.id] = file;
						global.vault[file.id].shares = crypto.pass2shares(key);
						// global.state.toput.push(file);
						// _.pull(global.state.tocrypt, file);
						// self.event.emit('encrypted', file);
						callback();
					} catch (err) {
						callback(err);
					}
				}
			});
		}, function (err) {
			// if any of the file processing produced an error, err would equal that error
			cb(err);
		});
	});
};

exports.putAll = function (cb) {
		const self = this;
		async.eachLimit(global.state.toput, API_REQ_LIMIT, function (file, callback) {
			if (!file) return;
			console.log(`TO PUT: ${file.name} (${file.id})`);
			global.drive.files.update({
				fileId: file.id,
				resource: {
					name: `${file.name}.crypto`
				},
				media: {
					mimeType: "application/octet-stream",
					body: fs.createReadStream(file.cryptPath)
				},
			}, function (err, res) {
				if (err) {
					console.log(`callback: error putting ${file.name}`);
					return callback(err);
				}
				console.log(`callback: put ${file.name}`);
				file.lastSynced = moment().format();
				_.pull(global.state.tocrypt, file);
				self.event.emit('put', file);
				return callback();
			});
		}, function (err) {
			cb(err);
		});
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
