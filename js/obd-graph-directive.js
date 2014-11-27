'use strict';

angular.module('app.graph', [])
  .directive('obdGraph', function ($parse) {
    return {
      restrict: 'E',
      scope: {
        value: '=',
        unit: '=',
        min: '=',
        max: '=',
        width: '@'
      },
      replace: false,
      link: function (scope, element, attrs) {
        var chart = d3.select(element[0]);
        var box = chart.append("svg").attr("height", 150).attr("width", scope.width).attr("class", "graph");
        var background = box.append("svg:g").attr("class", "background");
        background.append("svg:circle").attr("cx", 75).attr("cy", 75).attr("r", 75).attr("class", "meter");

        var startAngle = -(180 + 45);
        var endAngle = 45;
        var meterScale = d3.scale.linear().domain([scope.min, scope.max]).range([startAngle, endAngle]);
        var graphXScale = d3.scale.linear().domain([scope.min, scope.max]).range([149, 0]);
        var graphYScale = d3.scale.linear().domain([0, 100]).range([200, scope.width]);

        var ringbuffer = [];
        var ringbufferWait = 5;

        var lineFunc = d3.svg.line()
          .x(function(d, i) {
            return graphYScale(i);
          })
          .y(function(d) {
            return graphXScale(d);
          })
          .interpolate('basis');

        background.selectAll(".meterdot")
          .data(meterScale.ticks(20))
          .enter()
          .append("svg:line")
          .attr("class", "meterdot")
          .attr("x1", function (d, i) {
            if (i % 2 == 0) {
              return 137;
            } else {
              return 142;
            }
          })
          .attr("y1", 75)
          .attr("x2", 145)
          .attr("y2", 75)
          .attr("transform", function (d, i) {
            var angle = meterScale(d);
            return "rotate(" + angle + " 75 75)";
          });


        background.append("svg:line")
          .attr("class", "axis-x")
          .attr("x1", graphYScale(0))
          .attr("y1", graphXScale(scope.min))
          .attr("x2", graphYScale(0))
          .attr("y2", graphXScale(scope.max));

        background.append("svg:line")
          .attr("class", "axis-y")
          .attr("x1", graphYScale(0))
          .attr("y1", graphXScale(scope.min))
          .attr("x2", graphYScale(100))
          .attr("y2", graphXScale(scope.min));


        scope.$watch('value', function (newVal, oldVal) {
          if(ringbufferWait == 0) {
            if (ringbuffer.length == 100) {
              ringbuffer.pop();
            }
            ringbuffer.unshift(newVal);
            ringbufferWait = 5;
          }else{
            ringbufferWait--;
          }

          var label = box.selectAll('.valueLabel').data([newVal]);
          label.enter().append("svg:text").attr("class", "valueLabel")
            .attr("x", 75)
            .attr("y", 130)
            .attr("text-anchor", "middle")
            .text(function (d) {
              return d3.round(d, 2);
            });
          label.text(function (d) {
            return d3.round(d, 2);
          });

          var wiper = background.selectAll(".wiper")
            .data([newVal]);
          var wiperEnter = wiper.enter();
          wiperEnter.append("svg:line")
            .attr("class", "wiper")
            .attr("x1", 75)
            .attr("y1", 75)
            .attr("x2", 140)
            .attr("y2", 75);
          wiper.attr("transform", function (d, i) {
            var angle = meterScale(d);
            return "rotate(" + angle + " 75 75)";
          });

          var graphLine = box.selectAll('.graph-line').data([ringbuffer]);
          graphLine.enter().append('svg:path')
            .attr('class', 'graph-line')
            .attr('d', lineFunc);

          graphLine.attr('d', lineFunc);

        });
      }
    };
  });