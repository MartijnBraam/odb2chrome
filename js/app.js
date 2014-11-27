'use strict';

// Declare app level module which depends on views, and components
angular.module('app', [
  'ui.router',
  'app.serialport',
  'app.graph'
]).
  config(['$stateProvider', '$urlRouterProvider', function ($stateProvider, $urlRouterProvider) {
    $urlRouterProvider.otherwise("/connection");
    $stateProvider
      .state('connection', {
        url: "/connection",
        templateUrl: "view/connection.html"
      })
      .state('metrics', {
        url: "/metrics",
        templateUrl: "view/metrics.html"
      })
      .state('diagnostics', {
        url: "/diagnostics",
        templateUrl: "view/diagnostics.html"
      });
  }])
  .controller('app', function ($scope, elm327) {
    $scope.serialPorts = [];
    $scope.serialPortsRefreshing = false;
    $scope.elm327 = elm327;
    $scope.hideUnavailableSensors = true;
    $scope.serialPort = {
      baudrate: "38400",
      port: ""
    };

    $scope.refreshPorts = function () {
      $scope.serialPortsRefreshing = true;
      chrome.serial.getDevices(function (ports) {
        $scope.serialPorts = ports;
        $scope.serialPortsRefreshing = false;
        $scope.$apply();
      });
    };

    $scope.refreshPorts();
    $scope.connect = function () {
      if($scope.serialPort.port == ""){
        $scope.elm327.config.port = "/dev/ttyUSB0";
      }else {
        $scope.elm327.config.port = $scope.serialPort.port;
      }
      $scope.elm327.config.baudrate = parseInt($scope.serialPort.baudrate, 10);
      elm327.connect();
    };

    $scope.checkAll = function () {
      for (var key in $scope.elm327.pids) {
        if ($scope.elm327.pids.hasOwnProperty(key)) {
          if ($scope.elm327.pids[key].available) {
            $scope.elm327._queue.push("01" + key + "1\r");
          }
        }
      }
    };

    $scope.getDTC = function () {
      $scope.elm327._queue.push("03\r");
    };
    $scope.clearDTC = function () {
      $scope.elm327._queue.push("04\r");
      $scope.elm327._queue.push("03\r");
    };

    $scope.pids = [];
    $scope.bootstrapEnable = function (pid) {
      $scope.elm327._queue.push("01" + pid + "1\r");
    };
    $scope.$watch("elm327.pids", function (newValue, oldValue) {
      console.log("WATCHED!");
      $scope.pids = [];
      for (var key in newValue) {
        if (newValue.hasOwnProperty(key)) {
          if (newValue[key].hasOwnProperty("enabled") && newValue[key].enabled) {
            $scope.pids.push(newValue[key]);
          }
        }
      }
    }, true);

  });