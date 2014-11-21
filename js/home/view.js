'use strict';

angular.module('app.home', ['ngRoute'])

  .config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
      templateUrl: 'js/home/view.html',
      controller: 'home'
    });
  }])

  .controller('home', function ($scope, serialPort) {
    $scope.serialPorts = [];
    $scope.serialPortsRefreshing = false;
    $scope.serialPort = serialPort.config;

    $scope.refreshPorts = function(){
      $scope.serialPortsRefreshing = true;
      chrome.serial.getDevices(function(ports) {
        $scope.serialPorts = ports;
        $scope.serialPortsRefreshing = false;
        $scope.$apply();
      });
    };

    $scope.refreshPorts();

    $scope.connect = function(){

    }

  });