'use strict';
/**
 * sync.js
 * Main cloud sync functionality
 ******************************/

let levelup = require('levelup'),
	fs = require('fs-extra'),
	_ = require('lodash'),
	google = require('googleapis'),
	res = require('../static/js/res'),
	moment = require('moment'),
	EventEmitter = require('events').EventEmitter,
	crypto = require('./crypto'),
	async = require('async');

const API_REQ_LIMIT = 7;
const CONCURRENCY = 2;
// class SyncEmitter extends EventEmitter {};

exports.event = new EventEmitter();

// first global.state.toGet.push(file);
// then enqueue
exports.getQueue = async.queue(function (file, callback) {
	let parentPath = global.state.rfs[file.parents[0]].path;
	const dir = `${global.paths.home}${parentPath}`;
	const path = (parentPath === "/") ? `${dir}${file.name}` : `${dir}/${file.name}`;
	file.path = path;
	global.files[file.id].path = path;

	fs.mkdirs(dir, function (err) {
		if (err) callback(err);
		console.log(`GETing ${file.name} at dest ${path}`);
		let dest = fs.createWriteStream(path);

		global.drive.files.get({
				fileId: file.id,
				alt: 'media'
			})
			.on('error', function (err) {
				console.log('Error during download', err);
				callback(err);
			})
			.pipe(dest)
			.on('error', function (err) {
				console.log('Error during writting to fs', err);
				callback(err);
			})
			.on('finish', function () {
				console.log(`Written ${file.name} to ${path}`);
				// self.event.emit('got', file);
				callback(null, file);
			});
	});
}, CONCURRENCY);

exports.cryptQueue = async.queue(function (file, callback) {
	fs.mkdirs(global.paths.crypted, function (err) {
		if (err) return callback(err);
		const self = this;
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
					global.files[file.id] = file;
					global.vault[file.id] = _.cloneDeep(file);
					global.vault[file.id].shares = crypto.pass2shares(key);
					callback(null, file);
				} catch (err) {
					callback(err);
				}
			}
		});
	});
}, CONCURRENCY);

exports.updateQueue = async.queue(function (file, callback) {
	const self = this;
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
		global.files[file.id] = file;
		callback(null, file);
	});

}, CONCURRENCY);

exports.updateStats = function (file, callback) {
	fs.Stats(file.path, function (err, stats) {
		if (err) {
			console.log(`fs.Stats ERROR: ${err.stack}`);
			return callback(err);
		}
		console.log(`fs.Stats: for ${file.name}, file.mtime = ${stats.mtime}`);
		console.log(`fs.Stats: for ${file.name}, file.size = ${stats.size}`);
		file.mtime = stats.mtime;
		file.size = stats.size;
		// global.files[file.id] = file;
		console.log(`GOT fs.Stat of file, mtime = ${file.mtime}`);
		callback(null, file);
	});

};

exports.getAll = function (toGet, cb) {
	// const self = this;
	async.eachLimit(toGet, API_REQ_LIMIT, function (file, callback) {
		if (!file) return;
		let parentPath = global.state.rfs[file.parents[0]].path;
		const dir = `${global.paths.home}${parentPath}`;
		const path = (parentPath === "/") ? `${dir}${file.name}` : `${dir}/${file.name}`;
		file.path = path;
		// not linked list with file.id as key!
		global.files[file.id].path = path;

		// TODO: replace with mkdirp
		fs.mkdirs(dir, function (err) {
			if (err) callback(err);
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
				.pipe(dest)
				.on('error', function (err) {
					console.log('Error during writting to fs', err);
					callback(err);
				})
				.on('finish', function () {
					console.log(`Written ${file.name} to ${path}`);
					// self.event.emit('got', file);
					_.pull(toGet, file); // remove from toGet queue
					global.state.toCrypt.push(file); // add from toCrypt queue
					callback();
				});
		});
	}, function (err) {
		cb(err);
	});
};

exports.cryptAll = function (toCrypt, cb) {
	const self = this;
	fs.mkdirs(global.paths.crypted, function (err) {
		if (err) callback(err);
		async.each(toCrypt, function (file, callback) {
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
						global.files[file.id] = file;
						global.vault[file.id] = file;
						global.vault[file.id].shares = crypto.pass2shares(key);
						// global.state.toUpdate.push(file);
						// _.pull(toCrypt, file);
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
	async.eachLimit(global.state.toUpdate, API_REQ_LIMIT, function (file, callback) {
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
			_.pull(global.state.toCrypt, file);
			self.event.emit('put', file);
			return callback();
		});
	}, function (err) {
		cb(err);
	});
};

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
