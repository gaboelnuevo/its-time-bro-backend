'use strict';

var app = require('../../server/server');

var UserNotification = app.models.UserNotification;
var AppUser = app.models.AppUser;

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

  Relationship.observe('after save', function(ctx, next) {
    if (ctx.isNewInstance) {
      if (ctx.instance.status === 'pending') {
        var actionUserId = ctx.instance.actionUserId;
        var notifyUserId = (
          actionUserId.toString() === ctx.instance.firstUserId.toString() ?
          ctx.instance.secondUserId : ctx.instance.firstUserId
        );
        AppUser.findById(actionUserId, {
          fields: {
            id: true,
            username: true,
          },
        }).then(function(sender) {
          return UserNotification.create({
            type: 'friend_request',
            userId: notifyUserId,
            payload: {
              message: sender.username + ' want to be your friend.',
              senderId: actionUserId.toString(),
              sender: sender,
            },
          });
        }).then(function(notification) {
          next();
        }).catch(function(err) {
          next(err);
        });
      } else {
        next();
      }
    } else {
      next();
    }
  });
};
