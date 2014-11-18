'use strict';

angular.module('app.home', ['ngRoute'])

  .config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
      templateUrl: 'js/home/view.html',
      controller: 'home'
    });
  }])

  .controller('home', function ($scope, $http) {

  });