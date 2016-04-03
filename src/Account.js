'use strict'
/**
 * Account.js
 * User accounts
 ******************************/

const google = require('googleapis'),
  googleAuth = require('google-auth-library'),
  request = require('request')

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
function Account (type, name, email, profileImg, quota, oauth) {
  this.type = type
  this.name = name
  this.email = email
  this.profileImg = profileImg
  this.quota = quota
  this.oauth = oauth
// TODO: Implement qouta functionality
// this.qouta = qouta
}

module.exports = Account
