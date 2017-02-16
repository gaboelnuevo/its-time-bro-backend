'use strict';
var app = require('../../server/server');
var LoopBackContext = require('loopback-context');

module.exports = function(AppUser) {
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

  AppUser.listFriends = function(id, cb) {
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
      AppUser.find({
        where: {
          id: {
            inq: data ? mapRelationshipDataIds(data, id) : [],
          },
        },
      }, cb);
    });
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
        verb: 'post',
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
        verb: 'get',
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
        verb: 'get',
      },
    }
  );
};
