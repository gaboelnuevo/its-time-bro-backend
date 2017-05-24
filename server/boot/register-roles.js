'use strict';

module.exports = function(app) {
  var Role = app.models.Role;
  var AppUser = app.models.AppUser;

  Role.registerResolver('friend', function(role, ctx, cb) {
    function reject() {
      process.nextTick(function() {
        cb(null, false);
      });
    }

    // if the target model is not valid
    if (ctx.modelName !== 'AppUser' && ctx.modelName !== 'Alarm') {
      return reject();
    }

    // do not allow anonymous users
    var userId = ctx.accessToken.userId;
    if (!userId) {
      return reject();
    }

    ctx.model.findById(ctx.modelId, function(err, data) {
      if (err || !data) return reject();
      var userId = ctx.modelName === 'AppUser' ? ctx.modelId : data.userId;
      return AppUser.checkFriendship(
        userId,
        {
          accessToken: ctx.accessToken,
        },
        function(err, isFriend, relationship) {
          cb(err, isFriend);
        }
      );
    });
  });
};
