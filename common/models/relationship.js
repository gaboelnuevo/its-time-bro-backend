'use strict';

module.exports = function(Relationship) {
  Relationship.validate(
    'relationship',
    relationshipValidator,
    {message: 'Invalid relationship'}
  );

  function relationshipValidator(err) {
    if (this.firstUserId.toString() >= this.secondUserId.toString()) {
      err();
    }
  }

  Relationship.observe('before save', function(ctx, next) {
    var token = ctx.options && ctx.options.accessToken;
    var currentUserId = token && token.userId;

    if (ctx.instance) {
      if (currentUserId) {
        ctx.instance.actionUserId = currentUserId;
      }
      ctx.instance.updatedAt = new Date();
    } else {
      if (currentUserId) {
        ctx.data.actionUserId = currentUserId;
      }
      ctx.data.updatedAt = new Date();
    }
    next();
  });
};
