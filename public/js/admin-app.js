/*
 * Admin app module
 */
var app = angular
    .module("AdminApp", ["conference.model", "firebase", "ngMaterial", "ngMessages", "ngSanitize", "ngCsv"])
    .config(function($mdThemingProvider) {
      // Main content theme
      $mdThemingProvider.theme('default')
        .primaryPalette('blue-grey')
        .accentPalette('red')
        .backgroundPalette('grey', {
          'default': '200'
        });
      // Card content theme
      $mdThemingProvider.theme('cardTheme')
        .primaryPalette('blue-grey')
        .accentPalette('red')
        .backgroundPalette('grey', {
          'default': '50'
        });
    });

/* Controller to manage user login */
app.controller("AuthCtrl", function($scope, $firebaseAuth, $mdDialog, $mdSidenav, Config, Avatar, Profile, ProfileList, Submission, SubmissionList, AcceptedSubmissions, Session, SessionList) {
  // add config parameters
  $scope.config = Config();
  $scope.validAdminUser = false;

  // Set the navigation selections
  $scope.toggleSidenav = function() {
    $mdSidenav('left').toggle();
  }
  $scope.closeSidenav = function () {
      $mdSidenav('left').close();
  }
  $scope.showView = function(item) {
    $scope.selectedPanel = item;
    $mdSidenav('left').close();
  }
  $scope.selectedPanel = 'speakers';

  $scope.showEventConfig = function(evt) {
    ShowConfigDialog(evt, $scope.config);
    $mdSidenav('left').close();
  }

  function ShowConfigDialog(evt, config) {
    $mdDialog.show({
      controller: DialogController,
      templateUrl: 'config.tmpl.html',
      parent: angular.element(document.body),
      targetEvent: evt,
      clickOutsideToClose:true,
      fullscreen: true,
      locals: {
        localConfig: config
      }
    })
    .then(function() {
      // Dialog cancelled
    });
  }

  // Handler for config dialog events
  function DialogController($scope, $mdDialog, localConfig) {
    $scope.config = localConfig;
    $scope.onConfigItemChanged = function() {
      $scope.config.$save();
    }

    $scope.hide = function() {
      $mdDialog.hide();
    };

    $scope.close = function() {
      $mdDialog.hide();
    };
  }

  // create an instance of the authentication service
  var auth = $firebaseAuth();
  auth.$onAuthStateChanged(function(firebaseUser) {
    if (firebaseUser == null) return;

    // Fetch firebase data
    $scope.profiles = ProfileList();
    $scope.submissions = SubmissionList();
    $scope.sessions = AcceptedSubmissions();
    $scope.schedule = SessionList();

    // Schedule mapped by start time for UI
    $scope.scheduleMap = {};
    $scope.timeSlots = [];
    $scope.schedule.$watch(function() {
      $scope.scheduleMap = {};
      $scope.timeSlots = [];
      angular.forEach($scope.schedule, function(item) {
        // Check if key exists first
        if (!(item.start_time in $scope.scheduleMap)) {
          $scope.scheduleMap[item.start_time] = [];
          $scope.timeSlots.push(item.start_time);
        }

        $scope.scheduleMap[item.start_time].push(item);
      })
    });

    // Compute reviewer data
    // TODO: Convert this computation to run with a cloud function
    $scope.scores = {};
    $scope.submissions.$loaded().then(function() {
      angular.forEach($scope.submissions, function(submission) {
        ComputeReviewScore(submission, $scope.scores);
      })
    });

    // Cache avatar URLs
    $scope.avatarUrls = {};
    $scope.profiles.$loaded().then(function() {
      angular.forEach($scope.profiles, function(profile) {
        GetAvatarUrl(profile, $scope.avatarUrls);
      })
    });
  });

  function ComputeReviewScore(item, scores) {
    //Set the default value
    scores[item.$id] = 0.0;
    if (item.scores) {
      var count = Object.keys(item.scores).length;
      if (count > 0) {
        var sum = 0.0;
        for (var key in item.scores) {
          sum += item.scores[key];
        }

        scores[item.$id] = sum / count;
      }
    }
  }

  function GetAvatarUrl(profile, urls) {
    Avatar(profile.$id).$getDownloadURL().then(function(url) {
      urls[profile.$id] = url;
    }).catch(function(error){
      urls[profile.$id] = "/images/placeholder.png";
    });
  }

  // login button function
  $scope.loginUser = function() {
    // create an instance of the authentication service
    var auth = $firebaseAuth();

    // login with Google
    auth.$signInWithPopup("google").then(function(firebaseUser) {
      $scope.firebaseUser = firebaseUser.user;
      $scope.validAdminUser = $scope.firebaseUser.uid in $scope.config.admins;
    }).catch(function(error) {
      $scope.error = error;
      $scope.validAdminUser = false;
    });
  };

  // logout button function
  $scope.logoutUser = function() {
    // create an instance of the authentication service
    var auth = $firebaseAuth();

    auth.$signOut().then(function() {
      $scope.firebaseUser = null;
      $scope.validAdminUser = false;
    });
  };

  // export button functions
  $scope.exportProfiles = function() {
    var exportList = [];
    for (var i = 0; i < $scope.profiles.length; i++) {
      var profile = $scope.profiles[i];
      exportList.push({
        name: profile.name,
        email: profile.email,
        company: profile.company,
        twitter: profile.twitter
      });
    }

    return exportList;
  };

  $scope.exportSchedule = function() {
    var exportList = [];
    for (var i = 0; i < $scope.sessions.length; i++) {
      var session = $scope.sessions[i];
      var speaker = $scope.profiles.$getRecord(session.speaker_id);
      var schedule = $scope.schedule.$getRecord(session.$id);
      exportList.push({
        name: speaker.name,
        email: speaker.email,
        twitter: speaker.twitter,
        image: $scope.avatarUrls[session.speaker_id],
        title: session.title,
        abstract: session.abstract,
        time: schedule ? schedule.start_time : "n/a",
        room: schedule ? schedule.room : "n/a"
      });
    }

    return exportList;
  };
});

/* Controller to list and manage speaker profiles */
app.controller("ProfileCtrl", function($scope, $firebaseArray, $mdDialog) {

  $scope.profileFilter = function(item) {
    var re = new RegExp($scope.profileFilterText, 'i');
    return !$scope.profileFilterText
            || re.test(item.name)
            || re.test(item.company);
  }

  $scope.showProfileDetail = function(evt, profileItem, avatarUrl) {
    ShowProfileDialog(evt, profileItem, avatarUrl);
  }

  function ShowProfileDialog(evt, profileItem, avatarUrl) {
    $mdDialog.show({
      controller: DialogController,
      templateUrl: 'profile.tmpl.html',
      parent: angular.element(document.body),
      targetEvent: evt,
      clickOutsideToClose:true,
      fullscreen: true,
      locals: {
        speaker: profileItem,
        imageUrl: avatarUrl
      }
    })
    .then(function() {
      // Dialog cancelled
    });
  }

  // Handler for profile dialog events
  function DialogController($scope, $mdDialog, speaker, imageUrl) {
    $scope.speaker = speaker;
    $scope.imageUrl = imageUrl;
    $scope.twitterUrl = function(twitterHandle) {
      return twitterHandle.replace('@', 'https://twitter.com/');
    };

    $scope.hide = function() {
      $mdDialog.hide();
    };

    $scope.close = function() {
      $mdDialog.hide();
    };
  }
});

/* Controller to list and manage submission items */
app.controller("SubmissionCtrl", function($scope, $firebaseObject, $firebaseArray, $mdDialog, $mdToast, Session) {

  $scope.submissionFilter = function(item) {
    var re = new RegExp($scope.subFilterText, 'i');
    return !$scope.subFilterText
            || re.test($scope.profiles.$getRecord(item.speaker_id).name)
            || re.test(item.title)
            || re.test(item.abstract);
  }

  $scope.sortOptions = [
    {value: 'title', label: "Session Title"},
    {value: 'name', label: "Speaker Name"},
    {value: 'score', label: "Reviewer Score"},
    {value: 'accepted', label: "Accepted Status"}
  ];
  $scope.sortProperty = 'title';
  $scope.reverseSort = false;
  $scope.getSortParam = function(item) {
    switch ($scope.sortProperty) {
      case 'name':
        $scope.reverseSort = false;
        return $scope.profiles.$getRecord(item.speaker_id) ?
                $scope.profiles.$getRecord(item.speaker_id).name : "";
      case 'score':
        $scope.reverseSort = true;
        return $scope.scores[item.$id];
      case 'accepted':
        $scope.reverseSort = false;
        if (item.accepted) {
          return 0;
        } else { // False and undefined are treated the same
          return 1;
        }
      case 'title':
      default:
        $scope.reverseSort = false;
        return item.title;
    }
  }

  $scope.onTalkSelectionChanged = function(submissionItem) {
    if (!submissionItem.accepted) {
      // Delete any existing schedule information
      var session = Session(submissionItem.$id);
      session.$remove();
    }
    // Update the accepted state
    $scope.submissions.$save(submissionItem);
  }

  $scope.showSubmissionDetail = function(evt, submissionItem, profileItem) {
    ShowEntryDialog(evt, submissionItem, profileItem);
  }

  function ShowEntryDialog(evt, submissionItem, profileItem) {
    $mdDialog.show({
      controller: DialogController,
      templateUrl: 'submission.tmpl.html',
      parent: angular.element(document.body),
      targetEvent: evt,
      clickOutsideToClose:true,
      fullscreen: true,
      locals: {
        entry: submissionItem,
        speaker: profileItem
      }
    })
    .then(function(item) {
      // Submission save
      $scope.submissions.$save(item).then(function() {
        $mdToast.show(
          $mdToast.simple()
            .textContent('Submission Updated')
            .hideDelay(3000)
        );
      }).catch(function(error) {
        $mdToast.show(
          $mdToast.simple()
            .textContent('Error updating submission. Please try again later.')
            .hideDelay(3000)
        );
      });
    },function() {
      // Dialog cancelled
    });
  }

  // Handler for entry dialog events
  function DialogController($scope, $mdDialog, entry, speaker) {
    $scope.entry = entry;
    $scope.speaker = speaker;

    $scope.getScoreCount = function(scores) {
      return Object.keys(scores).length;
    };

    $scope.hide = function() {
      $mdDialog.hide();
    };

    $scope.close = function() {
      $mdDialog.cancel();
    };

    $scope.save = function(item) {
      $mdDialog.hide(item);
    }
  }
});

/* Controller to manage talk schedule */
app.controller("ScheduleCtrl", function($scope, $mdDialog, $mdToast, Session, Config) {

  //Clean labels for each time slot
  $scope.getSlotLabel = function(dateString) {
    var d = new Date(dateString);
    return d.toLocaleTimeString();
  }

  $scope.updateScheduleItem = function(evt, submissionItem, speakerProfile) {
    var sessionInfo = Session(submissionItem.$id);

    ShowScheduleDialog(evt, submissionItem, speakerProfile, sessionInfo);
  }

  $scope.clearScheduleItem = function(scheduleItem) {
    $scope.schedule.$remove(scheduleItem);
  };

  $scope.isSpeakerUnique = function(scheduleItem) {
    var count = 0;
    for (session of $scope.sessions) {
      if (session.speaker_id === scheduleItem.speaker_id) {
        count++;
      }
    }

    return count < 2;
  }

  function ShowScheduleDialog(evt, submissionItem, speakerProfile, sessionInfo) {
    $mdDialog.show({
      controller: DialogController,
      templateUrl: 'schedule.tmpl.html',
      parent: angular.element(document.body),
      targetEvent: evt,
      clickOutsideToClose:true,
      fullscreen: true,
      locals: {
        config: $scope.config,
        entry: submissionItem,
        speaker: speakerProfile,
        session: sessionInfo
      }
    })
    .then(function(session){
      // Session saved
      sessionInfo.speaker_id = [submissionItem.speaker_id];
      sessionInfo.submission_id = submissionItem.$id;
      sessionInfo.event_type = 'session';
      // Set the timestamps
      var time = new Date(sessionInfo.start_time);
      sessionInfo.start_time = time.toISOString();
      time.setMinutes(time.getMinutes() + $scope.config.session_length);
      sessionInfo.end_time = time.toISOString();

      sessionInfo.$save().then(function() {
        $mdToast.show(
          $mdToast.simple()
            .textContent('Schedule Updated')
            .hideDelay(3000)
        );
      }).catch(function(error) {
        $mdToast.show(
          $mdToast.simple()
            .textContent('Error updating schedule. Please try again later.')
            .hideDelay(3000)
        );
      });
    },function() {
      // Dialog cancelled
    });
  }

  // Handler for schedule dialog events
  function DialogController($scope, $mdDialog, config, entry, speaker, session) {

    // Common functions to map the option values to date strings in database
    $scope.getTimeKey = function(dateString) {
      var d = new Date(dateString);
      return d.toISOString();
    };
    $scope.getTimeLabel = function(dateString) {
      var d = new Date(dateString);
      return d.toLocaleString();
    }

    $scope.timeOptions = [];
    for (var i = 0; i < config.event_dates.length; i++) {
      for (var j = 0; j < config.session_times.length; j++) {
        var dateString = config.event_dates[i]+'T'+config.session_times[j];
        var next = {value: $scope.getTimeKey(dateString), label: $scope.getTimeLabel(dateString)};
        $scope.timeOptions.push(next);
      }
    }

    $scope.roomOptions = [];
    for (var key in config.venue_rooms) {
      if (config.venue_rooms.hasOwnProperty(key)) {
        var next = {value: key, label: config.venue_rooms[key]};
        $scope.roomOptions.push(next);
      }
    }

    $scope.levelOptions = [];
    for (var key in config.session_levels) {
      if (config.session_levels.hasOwnProperty(key)) {
        var next = {value: key, label: config.session_levels[key]};
        $scope.levelOptions.push(next);
      }
    }

    $scope.entry = entry;
    $scope.speaker = speaker;
    $scope.session = session;

    $scope.hide = function() {
      $mdDialog.hide();
    };

    $scope.cancel = function() {
      $mdDialog.cancel();
    };

    $scope.save = function(session) {
      if ($scope.sessionForm.$valid) {
        $mdDialog.hide(session);
      }
    }
  }
});
