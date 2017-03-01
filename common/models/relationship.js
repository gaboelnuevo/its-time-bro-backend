'use strict';

module.exports = function(Relationship) {
  Relationship.validate(
    'relationship',
    relationshipValidator,
    {message: 'Invalid relationship'}
  );

  function relationshipValidator(err) {
    if (this.secondUserId > this.firstUserId) {
      err();
    }
  }

  Relationship.observe('before save', function(ctx, next) {
    var currentContext = LoopBackContext.getCurrentContext();
    var currentUser = currentContext && currentContext.get('currentUser');

    if (ctx.instance) {
      if (currentUser) {
        ctx.instance.actionUserId = currentUser.id;
      }
      ctx.instance.updatedAt = new Date();
    } else {
      if (currentUser) {
        ctx.data.actionUserId = currentUser.id;
      }
      ctx.data.updatedAt = new Date();
    }
    next();
  });
};
