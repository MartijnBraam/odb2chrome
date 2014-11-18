'use strict';

angular.module('app.home', ['ngRoute'])

  .config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
      templateUrl: 'js/home/view.html',
      controller: 'home'
    });
  }])

  .controller('home', function ($scope, $http) {
    $scope.serialPorts = [];

    $scope.refreshPorts = function(){
      chrome.serial.getDevices(function(ports) {
        $scope.serialPorts = ports;
      });
    };

    $scope.refreshPorts();

  });