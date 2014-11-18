'use strict';

// Declare app level module which depends on views, and components
angular.module('app', [
  'ngRoute',
  'app.home'
]).
  config(['$routeProvider', '$logProvider', function ($routeProvider, $logProvider) {
    $routeProvider.otherwise({redirectTo: '/'});
    $logProvider.debugEnabled(true);
  }]);