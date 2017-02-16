'use strict';

module.exports = function(VoiceNote) {
  VoiceNote.beforeRemote('create', function(ctx, modelInstance, next) {
    ctx.args.data.userId = ctx.req.accessToken && ctx.req.accessToken.userId;
    next();
  });
};
