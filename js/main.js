var connectionId = -1;
var state = "stopped";
var gauges = null;
var crlfinit = false;

// Convert string to ArrayBuffer
function convertStringToArrayBuffer(str) {
    var buf=new ArrayBuffer(str.length);
    var bufView=new Uint8Array(buf);
    for (var i=0; i<str.length; i++) {
        bufView[i]=str.charCodeAt(i);
    }
    return buf;
}

function convertArrayBufferToString(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function onSend(info){

}

function parseObdResponse(data){
    var ret = [];
    console.log({'parseObdResponse': data})
    data.forEach(function(response){
        if(response != '>'){
            var part = response.split(" ");
            part.splice(0, 2);
            ret = ret.concat(part);
        }
    });
    console.log(ret);
    for(var i = 0; i<ret.length; i++){
        ret[i] = parseInt("0x" + ret[i], 16);
    }
    return ret;
}

function onResponse(lines){
    console.log({'receiveLines': lines});
    switch(state){
        case "reset":
            state = "disableEcho";
            if(crlfinit){
                writeSerial("ATE0\r\n");
            }else{
                writeSerial("ATE0\r");
            }

            break;
        case "disableEcho":
            if(crlfinit){
                state = "disableCRLF";
                writeSerial("ATL0\r\n");
            }else{
                state = "versionRequest";
                writeSerial("ATI\r");
            }
            break;
        case "disableCRLF":
            state = "versionRequest";
            writeSerial("ATI\r");
            break;
        case "versionRequest":
            console.log({'elmVersion': lines});
            $("#elmVersion").text(lines[0]);
            state = "autoConfig";
            writeSerial("ATSP0\r");
            break;
        case "autoConfig":
            state = "checkVoltage";
            writeSerial("ATRV\r");
            break;
        case "checkVoltage":
            $("#elmVoltage").text(lines[0]);
            state = "getMode1Support";
            writeSerial("0100\r");
            break;
        case "getMode1Support":
            if(lines[0].indexOf("SEARCHING")>-1){
                lines.shift();
            }
            if(lines[0].indexOf("UNABLE TO CONNECT")>-1){
                state='error';
                alertMessage('ELM327 is unable to connect to the car.');
                break;
            }
            var data = parseObdResponse(lines);
            var mode1support = {
                '01': {'available': (data[0]&128) ? true : false, 'name': 'Monitor status since DTCs cleared'},
                '02': {'available': (data[0]&64) ? true : false, 'name': 'Freeze DTC'},
                '03': {'available': (data[0]&32) ? true : false, 'name': 'Fuel system status'},
                '04': {'available': (data[0]&16) ? true : false, 'name': 'Calculated engine load value'},
                '05': {'available': (data[0]&8) ? true : false, 'name': 'Engine coolant temperature'},
                '06': {'available': (data[0]&4) ? true : false, 'name': 'Short term fuel % trim—Bank 1'},
                '07': {'available': (data[0]&2) ? true : false, 'name': 'Long term fuel % trim—Bank 1'},
                '08': {'available': (data[0]&1) ? true : false, 'name': 'Short term fuel % trim—Bank 2'},

                '09': {'available': (data[1]&128) ? true : false, 'name': 'Long term fuel % trim—Bank 2'},
                '0A': {'available': (data[1]&64) ? true : false, 'name': 'Fuel pressure'},
                '0B': {'available': (data[1]&32) ? true : false, 'name': 'Intake manifold absolute pressure'},
                '0C': {'available': (data[1]&16) ? true : false, 'name': 'Engine RPM'},
                '0D': {'available': (data[1]&8) ? true : false, 'name': 'Vehicle speed'},
                '0E': {'available': (data[1]&4) ? true : false, 'name': 'Timing advance'},
                '0F': {'available': (data[1]&2) ? true : false, 'name': 'Intake air temperature'},
                '10': {'available': (data[1]&1) ? true : false, 'name': 'MAF air flow rate'},

                '11': {'available': (data[2]&128) ? true : false, 'name': 'Throttle position'},
                '12': {'available': (data[2]&64) ? true : false, 'name': 'Commanded secondary air status'},
                '13': {'available': (data[2]&32) ? true : false, 'name': 'Oxygen sensors present'},
                '14': {'available': (data[2]&16) ? true : false, 'name': 'Bank 1, Sensor 1'},
                '15': {'available': (data[2]&8) ? true : false, 'name': 'Bank 1, Sensor 2'},
                '16': {'available': (data[2]&4) ? true : false, 'name': 'Bank 1, Sensor 3'},
                '17': {'available': (data[2]&2) ? true : false, 'name': 'Bank 1, Sensor 4'},
                '18': {'available': (data[2]&1) ? true : false, 'name': 'Bank 2, Sensor 1'},

                '19': {'available': (data[3]&128) ? true : false, 'name': 'Bank 2, Sensor 2'},
                '1A': {'available': (data[3]&64) ? true : false, 'name': 'Bank 2, Sensor 3'},
                '1B': {'available': (data[3]&32) ? true : false, 'name': 'Bank 2, Sensor 4'},
                '1C': {'available': (data[3]&16) ? true : false, 'name': 'OBD standards this vehicle conforms to'},
                '1D': {'available': (data[3]&8) ? true : false, 'name': 'Oxygen sensors present'},
                '1E': {'available': (data[3]&4) ? true : false, 'name': 'Auxiliary input status'},
                '1F': {'available': (data[3]&2) ? true : false, 'name': 'Run time since engine start'},
                '20': {'available': (data[3]&1) ? true : false, 'name': 'PIDs supported [21 - 40]'}
            };
            var model1table = document.getElementById('mode1support');
            for(var key in mode1support){
                if(mode1support.hasOwnProperty(key)){
                    var pid = '01' + key;
                    var available = mode1support[key].available ? 'Yes' : 'No';
                    var name = mode1support[key].name;

                    var row = document.createElement('tr');
                    var col1 = document.createElement('td');
                    col1.innerText = pid;
                    var col2 = document.createElement('td');
                    col2.innerText = available;
                    var col3 = document.createElement('td');
                    col3.innerText = name;
                    row.appendChild(col1);
                    row.appendChild(col2);
                    row.appendChild(col3);
                    model1table.appendChild(row);
                }
            }
            console.log(data);
            state = "engineTemp";
            writeSerial("0105 1\r"); //request engine temp
            break;
        case "engineTemp":
            console.log('engineTempCase');
            var tempData = parseObdResponse(lines);
            var engineTemp = tempData[0] - 40;
            console.log({'temp': engineTemp, 'tempData': tempData});
            gauges.update('gauge-temp', engineTemp);
            state = "engineRPM";
            writeSerial("010C 1\r");
            break;
        case "engineRPM":
            var rpmData = parseObdResponse(lines);
            var engineRPM = ((rpmData[0] * 256) + rpmData[1]) / 4;
            gauges.update('gauge-rpm', engineRPM);
            state = "throttlePosition";
            writeSerial("0111 1\r");
            break;
        case "throttlePosition":
            var posData = parseObdResponse(lines);
            var pos = posData[0]*100/255;
            gauges.update('gauge-pedal', pos);
            state = "verhicleSpeed";
            writeSerial("010D 1\r");
            break;
        case "verhicleSpeed":
            var speedData = parseObdResponse(lines);
            var speed = speedData[0];
            gauges.update('gauge-speed', speed);
            state = "engineTemp";
            writeSerial("0105 1\r");
            break;
    }
}


function onReceive(info){
  var char=convertArrayBufferToString(info.data);
  if(char.length>1){
    chars = char.split('');
    for(var i=0; i<chars.length; i++){
      onReceiveChar(chars[i]);
    }
  }else{
    onReceiveChar(char);
  }
}

var readBuffer = "";
var lines = [];
function onReceiveChar(char){
    if(char == "\r"){
        if(readBuffer !== "") {
            lines.push(readBuffer);
            readBuffer = "";
        }
    }else if(char == ">"){
        onResponse(lines);
        lines = [];
        readBuffer = "";
    }else{
        readBuffer+=char;
    }
}




function writeSerial(str) {
    console.log({'state': state, 'sending': str});
    chrome.serial.send(connectionId, convertStringToArrayBuffer(str), onSend);
}

function onOpen(connectionInfo) {
    console.log(connectionInfo);
    if (!connectionInfo || connectionInfo.connectionId == -1) {
        $("#portConnect").removeAttr("disabled").text("Connect");
        alertMessage("Connection failed");
        return;
    }
    connectionId = connectionInfo.connectionId;
    $("#connectbutton").removeAttr("disabled").removeClass("btn-default").addClass("btn-danger").text("disconnect");
    chrome.serial.onReceive.addListener(onReceive);
    state = "reset";
    if(crlfinit){
        writeSerial("ATZ\r\n");
    }else {
        writeSerial("ATZ\r");
    }
}

function odbList(ports) {
    $("#serialport").find("option").remove();
    var portPicker = document.getElementById('serialport');
    ports.forEach(function(port) {
        var portOption = document.createElement('option');
        portOption.value = portOption.innerText = port.path;
        portPicker.appendChild(portOption);
    });
    $("#serialport").removeAttr("disabled");
}

function odbConnect() {
    $("#portConnect").attr("disabled", "disabled").text("Connecting...");
    var portPicker = document.getElementById('serialport');
    var baudPicker = document.getElementById('baudrate');
    var selectedPort = portPicker.options[portPicker.selectedIndex].value;
    var selectedBaudrate = baudPicker.options[baudPicker.selectedIndex].value;
    // Serial port options for ELM327 devices
    var options = {
        bitrate: parseInt(selectedBaudrate, 10),
        dataBits: "eight",
        parityBit: "no",
        stopBits: "one",
        ctsFlowControl: false
    };
    console.log(selectedPort);
    chrome.serial.connect(selectedPort, options, onOpen);
}

function odbRefresh() {
    $("#portRefresh").attr("disabled", "disabled");
    chrome.serial.getDevices(function(ports) {
        odbList(ports)
    });
}

function alertMessage(message){
    var alertBox = document.createElement("div");
    alertBox.className = "alert alert-danger alert-dismissable";

    var closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "close";
    closeButton.dataset.dismiss = "alert";
    closeButton.innerHTML = "&times;";

    alertBox.appendChild(closeButton);

    var messageDiv = document.createElement("div");
    messageDiv.innerHTML = message;
    alertBox.appendChild(messageDiv);
    var messageContainer = document.getElementById("messageContainer");
    messageContainer.appendChild(alertBox);
}
$(function(){
    odbRefresh();
    $("#connectbutton").click(function(){
        $(this).attr("disabed","disabled");
        crlfinit = $('#crlf').prop('checked');
        odbConnect();
    });

    gauges = new Gauges();
    gauges.add("gauge-rpm",0,7000,"RPM", "rpm");
    gauges.add("gauge-pedal",0,100,"Pedal position", "%");
    gauges.add("gauge-speed",0,255,"Speed", "km/h");
    gauges.add("gauge-temp",-40,215,"Coolant temperature", "&deg;C");
});