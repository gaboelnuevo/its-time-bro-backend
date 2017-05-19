'use strict';

module.exports = function(VoiceNote) {
  VoiceNote.beforeRemote('create', function(ctx, modelInstance, next) {
    var token = ctx.args.options && ctx.args.options.accessToken;
    var currentUserId = token && token.userId;
    ctx.args.data.senderId = currentUserId;
    next();
  });
};
