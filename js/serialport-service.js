'use strict';

angular.module('app.serialport', [])
  .factory("serialPort", function () {
    var instance = {
      config: {
        port: "",
        baudrate: 38400,
        crlf: false,
        state: 'disconnected',
        connectionId: -1
      }
    };

    instance._convertStringToArrayBuffer = function(str) {
      var buf=new ArrayBuffer(str.length);
      var bufView=new Uint8Array(buf);
      for (var i=0; i<str.length; i++) {
        bufView[i]=str.charCodeAt(i);
      }
      return buf;
    };

    instance._convertArrayBufferToString = function(buf) {
      return String.fromCharCode.apply(null, new Uint8Array(buf));
    };

    instance.connect = function () {
      var options = {
        bitrate: instance.config.baudrate,
        dataBits: "eight",
        parityBit: "no",
        stopBits: "one",
        ctsFlowControl: false
      };
      instance.config.state = 'connecting';
      chrome.serial.connect(instance.config.port, options, function (connectionInfo) {
        if (!connectionInfo || connectionInfo.connectionId == -1) {
          instance.config.state = 'disconnected';
          console.log('connection failed');
          return;
        }
        instance.config.state = 'connected';
        instance.config.connectionId = connectionInfo.connectionId;

        chrome.serial.onReceive.addListener(instance._onReceive);

        if(crlfinit){
          writeSerial("ATZ\r\n");
        }else {
          writeSerial("ATZ\r");
        }
      });
    };

    instance._onReceive = function(info){
      var char=instance._convertArrayBufferToString(info.data);
      if(char.length>1){
        var chars = char.split('');
        for(var i=0; i<chars.length; i++){
          onReceiveChar(chars[i]);
        }
      }else{
        onReceiveChar(char);
      }
    };
    instance.lines = [];
    instance.readBuffer = "";
    instance._onReceiveChar = function(char){
      if(char == "\r"){
        if(instance.readBuffer !== "") {
          instance.lines.push(readBuffer);
          instance.readBuffer = "";
        }
      }else if(char == ">"){
        instance._onResponse(lines);
        instance.lines = [];
        instance.readBuffer = "";
      }else{
        instance.readBuffer+=char;
      }
    };

    instance._onResponse = function (lines){

    };

    return instance;
  });