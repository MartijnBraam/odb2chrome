'use strict';

// Declare app level module which depends on views, and components
angular.module('app', [
  'ui.router',
  'app.serialport'
]).
  config(['$stateProvider', '$urlRouterProvider', function ($stateProvider, $urlRouterProvider) {
    $urlRouterProvider.otherwise("/connection");
    $stateProvider
      .state('connection', {
        url: "/connection",
        templateUrl: "view/connection.html"
      });
  }])
  .controller('app', function ($scope, elm327) {
    $scope.serialPorts = [];
    $scope.serialPortsRefreshing = false;
    $scope.elm327 = elm327;
    $scope.hideUnavailableSensors = true;

    $scope.refreshPorts = function () {
      $scope.serialPortsRefreshing = true;
      chrome.serial.getDevices(function (ports) {
        ports.push({"port": "/dev/pts/7"});
        console.log(ports);
        $scope.serialPorts = ports;
        $scope.serialPortsRefreshing = false;
        $scope.$apply();
      });
    };

    $scope.refreshPorts();
    $scope.connect = function () {
      $scope.elm327.config.port = "/dev/ttyUSB0";
      elm327.connect();
    };

    $scope.checkAll = function () {
      for (var key in $scope.elm327.pids) {
        if ($scope.elm327.pids.hasOwnProperty(key)) {
          $scope.elm327._queue.push("01" + key + "1\r");
        }
      }
    };

  });