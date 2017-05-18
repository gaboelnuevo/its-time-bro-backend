'use strict';

var mongodbUri = require('mongodb-uri');

var URI = process.env.MONGODB_URI;
var uriObject = URI ? mongodbUri.parse(URI) : null;

var config = {};

if (uriObject && uriObject.hosts.length >= 1) {
  config.db = {
    name: 'db',
    connector: 'mongodb',
    host: uriObject.hosts[0].host,
    port: uriObject.hosts[0].port,
    database: uriObject.database,
  };
}

module.exports = config;
