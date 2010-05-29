var Game = function(canvas) {
  var self = new Object();
  self.canvas = canvas;
  self.robots = [];

  self.add = function(robot) {
  }

  self.start = function() {
  }

  return self;
}

var Program = function(source) {
  var self = new Object();
  self.errors = '';

  return self;
}

var Robot = function(program) {
  var self = new Object();
  self.program = program;

  return self;
}
