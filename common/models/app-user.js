'use strict';
var app = require('../../server/server');
var LoopBackContext = require('loopback-context');

// Add more reserver words from this list: http://blog.postbit.com/reserved-username-list.html

var reservedWords = [
  'user',
  'username',
  'admin',
  'master',
  'http',
  'https',
  'www',
  'db',
  'database',
  'ftp',
  's3',
  'api',
  'email',
  'about',
  'contact',
  'adds',
  'login',
  'logout',
  'home',
  'register',
  'example',
  'download',
  'downloads',
  'me',
  'you',
  'yourname',
  'yourusername',
  'yoursite',
  'yourdomain',
  'myusername',
  'bot',
  'pay',
  'sale',
  'shop',
  'premium',
  'games',
  'imbox',
  'notifications',
  'add',
  'follow',
  'voicenotes',
  'users',
  'list',
  'id',
  'test',
  'dev',
  'etc',
  'system',
  'chat',
  'video',
  'block',
  'unblock',
  'default',
  'wakeup',
  'alarm',
  'alarms',
];

var md5 = require('blueimp-md5');

var GRAVATAR_URI = 'https://www.gravatar.com/avatar/';

var _ = require('lodash');

var avatarSizes = {
  small: 100,
  medium: 300,
  large: 480,
};

module.exports = function(AppUser) {
  AppUser.validatesExclusionOf('username', {in: ['itstimebro']});
  AppUser.validatesExclusionOf('username', {in: reservedWords});

  var getRelationshipBetween = function(
    RelationshipModel,
    firstUserId,
    secondUserId,
    cb
  ) {
    RelationshipModel.findOne({
      where: {
        firstUserId: Math.min(firstUserId, secondUserId),
        secondUserId: Math.max(firstUserId, secondUserId),
      },
    }, cb);
  };

  var addFriend = function(RelationshipModel, currentUserId, friendId, cb) {
    getRelationshipBetween(
      RelationshipModel,
      currentUserId,
      friendId,
      function(err, relationship) {
        if (err) cb(err);
        if (!relationship) {
          var friendship = {
            firstUserId: Math.min(currentUserId, friendId),
            secondUserId: Math.max(currentUserId, friendId),
            actionUserId: currentUserId,
            status: 'pending',
          };
          RelationshipModel.create(friendship, function(err, data) {
            cb(err, err ? false : true);
          });
        } else {
          var hasRequest = (
            relationship.status === 'pending' &&
            relationship.actionUserId === friendId
          );
          if (hasRequest) {
            relationship.updateAttributes({
              updatedAt: new Date(),
              actionUserId: currentUserId,
              status: 'accepted',
            }, function(err, data) {
              cb(err, err ? false : true);
            });
          } else {
            cb(null, false);
          }
        }
      });
  };

  var blockUser = function(RelationshipModel, currentUserId, userId, cb) {
    getRelationshipBetween(
      RelationshipModel,
      userId,
      friendId,
      function(err, relationship) {
        if (err) cb(err);
        if (!relationship) {
          var blockUserData = {
            firstUserId: Math.min(userId, currentUserId),
            secondUserId: Math.max(userId, currentUserId),
            actionUserId: currentUserId,
            status: 'blocked',
          };
          RelationshipModel.create(blockUserData, function(err, data) {
            cb(err, err ? false : true);
          });
        } else {
          /* continue if current user is not blocked */
          var isBlocked = (
            relationship.status === 'blocked' &&
            relationship.actionUserId === userId
          );
          if (!isBlocked) {
            relationship.updateAttributes({
              updatedAt: new Date(),
              actionUserId: currentUserId,
              status: 'blocked',
            }, function(err, data) {
              cb(err, err ? false : true);
            });
          } else {
            cb(null, false);
          }
        }
      });
  };

  var mapRelationshipDataIds = function(data, excludedId) {
    return data.map(function(x) {
      return (x.secondUserId === excludedId ? x.firstUserId : x.secondUserId);
    });
  };

  var buildGravatarSizesMap = function(hash) {
    var result = {};
    for (var key in avatarSizes) {
      result[key] = GRAVATAR_URI + hash + '?s=' + avatarSizes[key];
    }
    return result;
  };

  AppUser.avatar = function(id, req, res, cb) {
    var redirect =  !(req.query.json || false);
    var avatarSize = req.query.size || req.query.s || 'small';

    if (avatarSize === 's') {
      avatarSize = 'small';
    }
    if (avatarSize === 'm') {
      avatarSize = 'medium';
    }
    if (avatarSize === 'l') {
      avatarSize = 'large';
    }

    AppUser.findOne({where: {id: id}}, function(err, user) {
      if (err) cb(err);
      if (!user) {
        err = new Error(
          'No instance with id ' + id + ' found for ' + AppUser.modelName
        );
        err.statusCode = 404;
        return cb(err);
      }

      var avatarSizesMap = (
        user.avatar || buildGravatarSizesMap(md5(user.email))
      );

      var avatarData = {
        url: avatarSizesMap[avatarSize] || avatarSizesMap['small'],
      };

      if (redirect) {
        res.redirect(avatarData.url);
      } else {
        cb(null, avatarData);
      }
    });
  };

  AppUser.addFriend = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (currentUser && currentUser.id !== id) {
      addFriend(RelationshipModel, currentUser.id, id, cb);
    } else {
      cb(null, false);
    }
  };

  AppUser.unfriend = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (currentUser) {
      getRelationshipBetween(RelationshipModel, currentUser.id, id,
        function(err, relationship) {
          if (err) cb(err);
          var shouldContinue = (
            relationship &&
            relationship.status !== 'blocked'
          );
          if (shouldContinue) {
            RelationshipModel.destroyById(relationship.id, function(err) {
              if (err) cb(err);
              cb(null, true);
            });
          } else {
            cb(null, false);
          }
        });
    } else {
      cb(null, false);
    }
  };

  AppUser.listBlockedUsersIds = function(id, validateActionUser, cb) {
    var RelationshipModel = app.models.Relationship;
    if (!cb) {
      cb = validateActionUser;
      validateActionUser = false;
    }
    var filter = {
      where: {
        and: [
          {
            or: [{
              firstUserId: id,
            },
              {
                secondUserId: id,
              }],
          },
          {
            status: 'blocked',
          },
        ],
      },
      fields: {
        firstUserId: true,
        secondUserId: true,
      },
    };
    RelationshipModel.find(
      _.merge({},
        filter,
        validateActionUser ? {actionUserId: id} : {}
      ), function(err, data) {
      if (err) cb(err);
      cb(null, mapRelationshipDataIds(data, id));
    });
  };

  AppUser.listFriendsIds = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    RelationshipModel.find({
      where: {
        and: [
          {
            or: [{
              firstUserId: id,
            },
            {
              secondUserId: id,
            }],
          },
          {
            status: 'accepted',
          },
        ],
      },
      fields: {
        firstUserId: true,
        secondUserId: true,
      },
    }, function(err, data) {
      if (err) cb(err);
      cb(null, mapRelationshipDataIds(data, id));
    });
  };

  AppUser.listFriends = function(id, cb) {
    AppUser.listFriendsIds(id, function(err, friendsIds) {
      if (err) cb(err);
      AppUser.find({
        where: {
          id: {
            inq: friendsIds || [],
          },
        },
      }, cb);
    });
  };

  AppUser.listBlockedUsers = function(cb) {
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    var userId = currentUser ? currentUser.id : null;
    if (userId) {
      AppUser.listBlockedUsersIds(userId, true, function(err, usersIds) {
        if (err) cb(err);
        AppUser.find({
          where: {
            id: {
              inq: usersIds || [],
            },
          },
        }, cb);
      });
    } else {
      cb (null, []);
    }
  };

  AppUser.block = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (currentUser) {
      blockUser(RelationshipModel, currentUser.id, id, cb);
    } else {
      cb(null, false);
    }
  };

  AppUser.unblock = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (currentUser) {
      getRelationshipBetween(RelationshipModel, currentUser.id, id,
        function(err, relationship) {
          if (err) cb(err);
          var shouldContinue = (
            relationship &&
            relationship.status === 'blocked' &&
            relationship.actionUserId === currentUser.id
          );
          if (shouldContinue) {
            RelationshipModel.destroyById(relationship.id, function(err) {
              if (err) cb(err);
              cb(null, true);
            });
          } else {
            cb(null, false);
          }
        });
    } else {
      cb(null, false);
    }
  };

  AppUser.checkFriendship = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (currentUser) {
      getRelationshipBetween(RelationshipModel, currentUser.id, id,
        function(err, data) {
          cb(err, data && data.status === 'accepted' ? true : false);
        });
    } else {
      cb(null, false);
    }
  };

  AppUser.remoteMethod(
    'avatar', {
      accepts: [
        {arg: 'id', type: 'number'},
        {arg: 'req', type: 'object', http: {source: 'req'}},
        {arg: 'res', type: 'object', http: {source: 'res'}},
      ],
      returns: {
        arg: 'data',
        type: 'object',
        root: true,
      },
      http: {
        path: '/:id/avatar',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'addFriend', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'success',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/:id/add-friend',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'unfriend', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'success',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/:id/unfriend',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'listFriends', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'friends',
        type: 'object',
        root: true,
      },
      http: {
        path: '/:id/list-friends',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'listBlockedUsers', {
      returns: {
        arg: 'users',
        type: 'object',
        root: true,
      },
      http: {
        path: '/blocked-users',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'checkFriendship', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'friends',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/:id/check-friendship',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'block', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'success',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/:id/block',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'unblock', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'success',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/:id/unblock',
        verb: 'post',
      },
    }
  );
};
