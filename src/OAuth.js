'use strict'
/**
 * OAuth.js
 * Establish a authorised OAuth 2 client
 ******************************/

// const fs = require('fs')
// const google = require('googleapis')
const googleAuth = require('google-auth-library')
const logger = require('../script/logger')
const SCOPES = ['https://www.googleapis.com/auth/drive']

function OAuth (type) {
  // TODO: Check type and accordingly init oauth2
  this.type = type
  this.oauth2Client
}

OAuth.prototype.authorize = function (token, callback) {
  var self = this
  // Authorize a client with the loaded credentials, then call the
  // Drive API.

  // Google Drive Auth
  logger.verbose(`Google Drive auth initiated`)
  const auth = new googleAuth()
  self.oauth2Client = new auth.OAuth2(process.env.clientId_, process.env.clientSecret_, process.env.redirectUri_)

  if (!token) {
    getNewToken(self, callback)
  } else {
    logger.verbose(`TOKEN FOUND: ${token}`)
    self.oauth2Client.credentials = JSON.parse(token)
    callback()
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} this.oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *		 client.
 */
function getNewToken (self, callback) {
  logger.verbose(`getNewToken`)
  const authUrl = self.oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  })
  // GO TO URL `authUrl` in BrowserWindow to auth user
  callback(authUrl)
}

OAuth.prototype.getToken = function (auth_code) {
  var self = this
  return new Promise(function (resolve, reject) {
    // Google Drive
    // logger.verbose(`getToken`)
    self.oauth2Client.getToken(auth_code, function (err, token) {
      if (err) {
        reject(new Error(`Error while trying to retrieve access token ${err}`))
        throw err
      }
      logger.verbose(`Got the ACCESS_TOKEN:
 ${require('util').inspect(token, { depth: null })}`)
      self.oauth2Client.credentials = token
      resolve(token)
    })
  })
}

module.exports = OAuth
