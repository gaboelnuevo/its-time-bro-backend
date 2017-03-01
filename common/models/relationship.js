'use strict';

module.exports = function(Relationship) {
  Relationship.observe('before save', function(ctx, next) {
    var currentContext = LoopBackContext.getCurrentContext();
    var currentUser = currentContext && currentContext.get('currentUser');

    if (ctx.instance) {
      ctx.instance.updatedAt = new Date();
      ctx.instance.actionUserId = currentUser.id;
    } else {
      ctx.data.updatedAt = new Date();
      ctx.instance.actionUserId = currentUser.id;
    }
    next();
  });
};
