'use strict';

module.exports = function(Relationship) {
  Relationship.observe('before save', function(ctx, next) {
    var currentUserId = ctx.req.accessToken && ctx.req.accessToken.userId;
    if (ctx.instance) {
      ctx.instance.updatedAt = new Date();
      ctx.instance.actionUserId = currentUserId;
    } else {
      ctx.data.updatedAt = new Date();
      ctx.data.actionUserId = currentUserId;
    }
    next();
  });
};
