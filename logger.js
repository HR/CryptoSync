'use strict'
/**
 * logger.js
 * Custom logger for debugging
 ******************************/
const winston = require('winston'),
	moment = require('moment')

winston.emitErrs = true
const fileTransport = new(winston.transports.File)({
	filename: `./debug/CS_debug_${moment().format('DD.MM@HH:MM').trim()}.log`,
	handleExceptions: true,
	maxsize: 5242880, //5MB
	colorize: false
})

module.exports = (!process.env.TEST_RUN) ? new(winston.Logger)({
	transports: [
		new(winston.transports.Console)({
			level: 'debug',
			handleExceptions: true,
			// timestamp: true,
			json: false,
			colorize: true
		}),
		fileTransport
	],
	exitOnError: false
}) : new(winston.Logger)({
	transports: [
		fileTransport
	],
	exitOnError: false
})
