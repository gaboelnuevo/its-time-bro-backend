'use strict';

var app = require('../../server/server');

module.exports = function(VoiceNote) {
  VoiceNote.beforeRemote('create', function(ctx, modelInstance, next) {
    var token = ctx.args.options.accessToken;
    var currentUserId = token && token.userId;
    ctx.args.data.senderId = currentUserId;
    next();
  });
};
