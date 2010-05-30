// Inspired by base2 and Prototype
(function(){
  var initializing = false, fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;
  // The base Class implementation (does nothing)
  this.Class = function(){};

  // Create a new Class that inherits from this class
  Class.extend = function(prop) {
  var _super = this.prototype;

  // Instantiate a base class (but only create the instance,
  // don't run the init constructor)
  initializing = true;
  var prototype = new this();
  initializing = false;

  // Copy the properties over onto the new prototype
  for (var name in prop) {
    // Check if we're overwriting an existing function
    prototype[name] = typeof prop[name] == "function" &&
    typeof _super[name] == "function" && fnTest.test(prop[name]) ?
    (function(name, fn){
      return function() {
      var tmp = this._super;

      // Add a new ._super() method that is the same method
      // but on the super-class
      this._super = _super[name];

      // The method only need to be bound temporarily, so we
      // remove it when we're done executing
      var ret = fn.apply(this, arguments);
      this._super = tmp;

      return ret;
      };
    })(name, prop[name]) :
    prop[name];
  }

  // The dummy class constructor
  function Class() {
    // All construction is actually done in the init method
    if ( !initializing && this.init )
    this.init.apply(this, arguments);
  }

  // Populate our constructed prototype object
  Class.prototype = prototype;

  // Enforce the constructor to be what we expect
  Class.constructor = Class;

  // And make this class extendable
  Class.extend = arguments.callee;

  return Class;
  };
})();

function fix360(value) {
  value %= 360;
  return (value < 0) ? 360 + value : value;
}

var Scoreboard = Class.extend({

  init: function(scoreboard_el, game) {
    this.paper = Raphael(scoreboard_el, 250, 250);
    this.game = game;
  },

  start: function() {
    var p = this.paper;
    p.clear();

    var PAD = 12;
    var y = PAD * 2;
    var attr = {fill: 'black', 'text-anchor': 'start', 'font-size': PAD + 'px'};

    var bg = p.rect(0, 0, p.width, p.height).attr({ fill: 'white', stroke: null });

    var title = p.text(PAD, y, 'RoboWar').attr(attr).attr('font-size', '30px');
    y += PAD * 3;

    this.counter = p.text(PAD, y, 'Chronons: 0').attr(attr);
    y += PAD * 2;

    var labels = [];
    for (var i = 0, robot; robot = this.game.robots[i]; i++) {
      p.rect(0, y - PAD, this.paper.width, PAD * 5).attr({fill: robot.color, stroke: null});
      labels.push({
        robot: robot,
        name: p.text(PAD, y + PAD * 0, robot.name).attr(attr).attr('font-weight', 'bold'),
        energy: p.text(PAD, y + PAD * 1, '').attr(attr),
        damage: p.text(PAD, y + PAD * 2, '').attr(attr),
        status: p.text(PAD, y + PAD * 3, '').attr(attr),
      });
      y += PAD * 5;
    }
    this.labels = labels;
  },

  update: function() {
    this.counter.attr('text', 'Chronons: ' + this.game.chronons);
    for (var i = 0, label; label = this.labels[i]; i++) {
      var robot = label['robot'];
      label['energy'].attr('text', 'Energy: ' + robot.energy);
      label['damage'].attr('text', 'Damage: ' + robot.damage);
      label['status'].attr('text', 'Status: ' + (robot.running ? 'running' : 'DEAD'));
    }
  },

});

var LAYER_ARENA = 0;
var LAYER_ROBOTS = 1;
var LAYER_PROJECTILES = 2;
// TODO: Remove layers -- they're not needed.

var Game = Class.extend({

  init: function(arena_el, scoreboard_el) {
    this.paper = Raphael(arena_el, 300, 300);

    this.actors = [];
    this.actors[LAYER_ARENA] = [new ArenaView(this.paper, arena)];
    this.actors[LAYER_ROBOTS] = [];
    this.actors[LAYER_PROJECTILES] = [];

    this.robots = [];
    this.projectiles = [];
    this.chronons = 0;

    this.scoreboard = new Scoreboard(scoreboard_el, this);
    this.arena = new Arena(this, this.paper.width, this.paper.height);
  },

  add_robot: function(robot) {
    robot.arena = this.arena;

    // Position randomly but away from the edges and not on top of another robot.
    var w = this.arena.width;
    var h = this.arena.height;
    var overlap = true;
    while (overlap) {
      robot.x = Math.floor(Math.random() * w * .8 + w * .1);
      robot.y = Math.floor(Math.random() * h * .8 + h * .1);
      overlap = false;
      for (var i = 0, other; other = this.robots[i]; i++) {
        overlap = overlap || robot.is_touching(other);
      }
    };

    this.actors[LAYER_ROBOTS].push(new RobotView(this.paper, robot));
    this.robots.push(robot);
  },

  start: function() {
    this.scoreboard.start();

    var w = this.arena.width;
    var h = this.arena.height;
    var self = this;
    var loop;
    loop = function() {
      // Increment chronons.
      self.chronons++;

      // Update robots.
      for (var i = 0, robot; robot = self.robots[i]; i++) {
        var x = robot.x, y = robot.y, r = robot.radius;
        robot.wall = (x <= r || y <= r || x >= w - r || y >= h - r);

        // Save the current X and Y of the robot in case one tries to move while touching.
        robot.old_x = x;
        robot.old_y = y;

        robot.step();

        if (!robot.running) {
          self.remove_robot(robot);  // Remove robot if dead.
        }

        robot.collision = false; // Updated below.
      }

      // Draw.
      self.draw();

      // Update projectiles.
      for (var i = 0, p; p = self.projectiles[i]; i++) {
        p.step();
        var x = p.x, y = p.y, r = p.radius;
        if (x < -r || y < -r || x > w + r || y > h + r) {
          self.remove_projectile(p, false);  // Remove if outside arena.
        }
      }

      // Check robot collisions.
      // TODO: Optimize -- quadtree or something.
      for (var i = 0, a; a = self.robots[i]; i++) {
        for (var j = 0, b; b = self.robots[j]; j++) {
          if (a == b) continue;
          if (a.is_touching(b)) {
            a.collision = b.collision = true;
            a.speedx = b.speedx = 0;
            a.speedy = b.speedy = 0;
            a.x = a.old_x;
            a.y = a.old_y;
            b.x = b.old_x;
            b.y = b.old_y;
          }
        }

        for (var j = 0, p; p = self.projectiles[j]; j++) {
          if (a.is_touching(p)) {
            self.remove_projectile(p, true);  // Remove if outside arena.
            a.damage -= p.energy;
          }
        }
      }

      // Update scoreboard.
      self.scoreboard.update();

      // Keep going if more than one bot is alive.
      if (self.robots.length > 1) {
        setTimeout(loop, 50);
      };
    };
    loop();
  },

  stop: function() {
    for (var i = 0, robot; robot = this.robots[i]; i++) {
      robot.running = false;
    }
  },

  draw: function() {
    for (var i = 0, group; group = this.actors[i]; i++) {
      for (var j = 0, actor; actor = group[j]; j++) {
        actor.update();
      }
    }
  },

  remove_robot: function(given) {
    // TODO: Optimize. (Duh.)
    var index;
    for (var i = 0; i < this.robots.length; i++) {
      if (this.robots[i] == given) index = i;
    }
    if (index == undefined) {
      throw new Error("Couldn't remove unknown Robot: " + given);
    }
    this.robots.splice(index, 1);

    index = undefined;
    var actors = this.actors[LAYER_ROBOTS];
    for (var i = 0; i < actors.length; i++) {
      if (actors[i].robot == given) index = i;
    }
    if (index == undefined) {
      throw new Error("Couldn't remove unknown RobotView for: " + given);
    }
    actors[index].animated_remove();
    actors.splice(index, 1);
  },

  add_projectile: function(p) {
    this.projectiles.push(p);
    this.actors[LAYER_PROJECTILES].push(new ProjectileView(this.paper, p));
  },

  remove_projectile: function(given, animate) {
    // TODO: Optimize. (Duh.)
    var index;
    for (var i = 0; i < this.projectiles.length; i++) {
      if (this.projectiles[i] == given) index = i;
    }
    if (index == undefined) {
      throw new Error("Couldn't remove unknown Projectile: " + given);
    }
    this.projectiles.splice(index, 1);

    index = undefined;
    var actors = this.actors[LAYER_PROJECTILES];
    for (var i = 0; i < actors.length; i++) {
      if (actors[i].projectile == given) index = i;
    }
    if (index == undefined) {
      throw new Error("Couldn't remove unknown ProjectileView for: " + given);
    }

    if (animate) {
      actors[index].animated_remove();
    } else {
      actors[index].remove();
    }

    actors.splice(index, 1);
  },

});

var Arena = Class.extend({

  init: function(game, width, height) {
    this.game = game;
    this.robots = game.robots;
    this.width = width;
    this.height = height;
  },

  do_range: function(observer) {
    var SCAN_DEGREES = 40;  // In robowar.pdf under 'RADAR'.
    var theta = SCAN_DEGREES * (Math.PI + Math.PI) / 360;
    var aim_radians = fix360(observer.aim + observer.look) * (Math.PI + Math.PI) / 360;

    var closest = 0;

    for (var i = 0, enemy; enemy = this.robots[i]; i++) {
      if (enemy == observer) continue;

      // Stolen from JRoboWar (lucas@elmorian.zetnet.co.uk), who got it right.
      var dx = observer.x - enemy.x;
      var dy = observer.y - enemy.y;
      if (dx != 0 && dy != 0 && enemy.radius > 0) {
        var distance = Math.sqrt( (dx * dx) + (dy * dy) );
        var enemy_dir = Math.atan2(dx, -dy) + Math.PI;

        if (Math.abs(aim_radians - enemy_dir) < theta / 2) {
          if (closest == 0 || closest > distance) {
            closest = distance;
          }
        }
      }
    }

    return closest;
  },

  create_projectile: function(type) {
    switch (type) {
      case 'BULLET': return new RegularBullet();
      case 'EXPLOSIVE_BULLET': return new ExplosiveBullet();
      case 'HELLBORE':
      case 'MINE':
      case 'MISSILE':
      case 'NUKE':
      case 'STUNNER':
      default: throw new Error('Unknown bullet type: ' + type);
    }
  },

  shoot: function(robot, type, energy) {
    var aim_radians = robot.aim * (Math.PI + Math.PI) / 360;
    var p = this.create_projectile(type);
    p.x = robot.x + Math.sin(aim_radians) * (robot.radius + 1);
    p.y = robot.y - Math.cos(aim_radians) * (robot.radius + 1);
    p.energy = energy;
    p.set_velocity(aim_radians, 12); // TODO 12?
    this.game.add_projectile(p);
  },

});

var Actor = Class.extend({
  init: function(paper) {},
  update: function() {},
  remove: function() {
    if (this.el) this.el.remove();
  },
  animated_remove: function() {
    var self = this;
    var attr = {scale: 3, opacity: 0};
    this.el.animate(attr, 500, function() {self.remove()});
  },
});

var Projectile = Class.extend({

  init: function() {
    this.x = 0;
    this.y = 0;
    this.radius = 2;
    this.energy = 0;
  },

  set_velocity: function(aim_radians, speed) {
    this.speedx = Math.sin(aim_radians) * speed;
    this.speedy = -Math.cos(aim_radians) * speed;
  },

  step: function() {
    this.x += this.speedx;
    this.y += this.speedy;
  },

});

var RegularBullet = Projectile.extend({
});

var ExplosiveBullet = Projectile.extend({
});

var ProjectileView = Actor.extend({

  init: function(paper, projectile) {
    this.projectile = projectile;
    var attr = {fill: 'black', stroke: null};
    this.el = paper.circle(projectile.x, projectile.y, projectile.radius).attr(attr);
    // TODO: Other projectile types
  },

  update: function() {
    var dx = this.projectile.x - this.el.getBBox().x + this.el.getBBox().width / 2;
    var dy = this.projectile.y - this.el.getBBox().y + this.el.getBBox().height / 2;
    this.el.translate(dx, dy);
  },

  animated_remove: function() {
    var self = this;
    this.el.attr({scale: 2, fill: 'orange'});
    var attr = {scale: 7, opacity: 0, fill: 'white'};
    this.el.animate(attr, 500, function() {self.remove()});
  },

});

var ArenaView = Actor.extend({
  init: function(paper, arena) {
    this.el = paper.rect(0, 0, paper.width, paper.height).attr({ fill: '#666', stroke: null });
  },
});

var OPERATIONS = {
  '+': 1,
  '-': 2,
  '*': 3,
  '/': 4,
  '=': 5,
  '!': 6,
  '>': 7,
  '<': 8,
  ABS: 9,
  AND: 10,
  ARCCOS: 11,
  ARCSIN: 12,
  ARCTAN: 13,
  BEEP: 14,
  CALL: 15,
  CHS: 16,
  COS: 17,
  COSINE: 17,
  DEBUG: 18,
  DEBUGGER: 18,
  DIST: 19,
  DROP: 20,
  DROPALL: 21,
  DUPLICATE: 22,
  DUP: 22,
  FLUSHINT: 23,
  IF: 25,
  IFE: 26,
  IFG: 27,
  IFEG: 28,
  INTOFF: 29,
  INTON: 30,
  JUMP: 31,
  MAX: 32,
  MIN: 33,
  MOD: 34,
  NOP: 35,
  NOT: 36,
  OR: 37,
  PRINT: 38,
  RECALL: 54,
  RETURN: 39,
  ROLL: 40,
  RTI: 41,
  SETINT: 42,
  SETPARAM: 43,
  SIN: 44,
  SINE: 44,
  STO: 46,
  STORE: 46,
  SQRT: 47,
  SWAP: 48,
  SYNC: 49,
  TAN: 50,
  TANGENT: 50,
  VSTORE: 51,
  VRECALL: 52,
  XOR: 53,
  EOR: 53,
};

var Instruction = Class.extend({});

var Operator = Instruction.extend({

  init: function(name) {
    this.name = name;
  },

  toString: function() {
    return "Operator: " + this.name;
  },

});

var Literal = Instruction.extend({

  init: function(value) {
    this.value = value;
  },

  toString: function() {
    return "Literal: " + this.value;
  },

});

var Variable = Instruction.extend({

  init: function(name) {
    this.name = name;
  },

  toString: function() {
    return "Variable: " + this.name;
  },

});

var Program = Class.extend({

  init: function() {
    this.errors = '';
    this.instructions = [];
    this.line_numbers = [];
    this.label_to_address = {};
    this.address_to_label = {};
  },

  parse: function(source) {
    var address = 0;
    var line_number = 0;
    var self = this;

    function push_instruction(i) {
      self.instructions.push(i);
      self.line_numbers.push(line_number);
      address++;
    }

    function parse_token(token) {
      // Label
      var match = token.match(/(\w+):$/);
      if (match) {
        var name = match[1];
        if (name in self.label_to_address) {
          this.errors += 'Label "' + name + '" redefined on line ' + line_number + "\n";
        }
        self.label_to_address[name] = address;
        self.address_to_label[address] = name;
        return;
      }

      // Operator
      if (token in OPERATIONS) {
        push_instruction(new Operator(token));
        return;
      }

      // Literal
      var value = parseInt(token);
      if (!isNaN(value)) {
        push_instruction(new Literal(value));
        return;
      }

      // Pointer
      match = token.match(/(\w+)'$/);
      if (match) {
        push_instruction(new Variable(match[1]));
        return;
      }

      // Variable
      if (token.match(/^\w+$/)) {
        push_instruction(new Variable(token));
        push_instruction(new Operator('RECALL'));
        return;
      }

      self.errors += 'Unknown token "' + token + '" on line ' + line_number + "\n";
    }

    var lines = source.split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      line_number = i + 1;
      var tokens = lines[i].replace(/#.*$/, '').split(/\s+/);

      for (var j = 0; j < tokens.length; j++) {
        var token = tokens[j].toUpperCase();
        if (token == '') continue;
        parse_token(token);
      }
    }
  },

});

var RobotView = Actor.extend({

  init: function(paper, robot) {
    this.robot = robot;

    var x = robot.x;
    var y = robot.y;

    this.body = paper.circle(x, y, robot.radius);
    this.body.attr({ stroke: robot.color, 'stroke-width': '2px' });

    this.turret = paper.path('M' + x + ' ' + y + 'L' + x + ' ' + (y - robot.radius));
    this.turret.attr({ stroke: 'white', 'stroke-width': '2px' });

    this.el = paper.set();
    this.el.push(this.body);
    this.el.push(this.turret);

    this.old_x = x;
    this.old_y = y;
  },

  update: function() {
    var dx = this.robot.x - this.old_x;
    var dy = this.robot.y - this.old_y;
    this.el.translate(dx, dy);
    this.turret.rotate(this.robot.aim, this.robot.x, this.robot.y);

    this.old_x = this.robot.x;
    this.old_y = this.robot.y;

    if (this.robot.energy <= 0) {
      this.body.attr('fill', 'red');
    } else {
      this.body.attr('fill', 'none');
    }
  },

  animated_remove: function() {
    var self = this;
    var attr = {scale: 2, opacity: 0, fill: 'white'};
    this.el.animate(attr, 1000, function() {self.remove()});
  },

});

var Robot = Class.extend({

  init: function(name, color, program) {
    this.name = name;
    this.color = color;
    this.program = program;
    this.speed = 30;
    this.running = true;
    this.chronons = 0;
    this.radius = 16;
    this.max_energy = 50;
    this.max_shield = 10;
    this.starting_damage = 150;
    this.explosive_bullets = false;
    this.set_trace(false);

    this.registers = {};
    this.vector = [];
    this.stack = [];
    this.ptr = 0;

    this.aim = 0;
    this.scan = 0;
    this.look = 0;
    this.energy = this.max_energy;
    this.damage = this.starting_damage;
    this.shield = 0;
    this.wall = false;
    this.collision = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
  },

  set_trace: function(enabled) {
    if (enabled) {
      this.trace = function() {console.log.apply(console, arguments)};
    } else {
      this.trace = function() {};
    }
  },

  debug_stack: function() {
    var output = [];
    for (var i = 0; i < this.stack.length; i++) {
      output.push(this.stack[i].toString());
    }
    this.trace('Stack:', output);
  },

  distance_to: function(other) {
    var a = this;
    var b = other;
    if (a == b) return 0;

    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt( (dx * dx) + (dy * dy) ) - a.radius - b.radius - 1; // TODO: is 1 ok?
  },

  is_touching: function(other) {
    if (this == other) return false;
    return this.distance_to(other) <= 0;
  },

  shoot: function(type, amount) {
    this.arena.shoot(this, type, amount);
    this.energy -= amount;
    // TOOD can't move and shoot
  },

  translate: function(axis, distance) {
    // TODO max distance?
    this.energy -= Math.abs(distance * 2);
    var r = this.radius;
    switch (axis) {
      case 'x':
        this.x = Math.max(r, Math.min(this.arena.width - r, this.x + distance));
        break;
      case 'y':
        this.y = Math.max(r, Math.min(this.arena.height - r, this.y + distance));
        break;
    }
    // TOOD can't move and shoot
  },

  set_speed: function(axis, value) {
    value = Math.max(-20, Math.min(20, value)); // TODO warn here?
    this.energy -= Math.abs(value * 2);
    switch (axis) {
      case 'x':
        this.vx = value;
        break;
      case 'y':
        this.vy = value;
        break;
    }
    // TOOD can't move and shoot
  },

  set_variable: function(name, value) {
    switch (name) {
      case 'AIM':
        this.aim = fix360(value);
        return;
      case 'BULLET':
        this.shoot(name, value);
        return;
      case 'BOTTOM':
      case 'BOT':
        return;
      case 'CHANNEL':
        throw new Error('Teamplay not yet implemented');
      case 'CHRONONS':
      case 'COLLISION':
      case 'DAMAGE':
      case 'DOPPLER':
      case 'ENERGY':
        return;
      case 'FIRE':
        this.shoot(this.explosive_bullets ? 'EXPLOSIVE' : 'BULLET', value);
        return;
      case 'FRIEND':
        throw new Error('Teamplay not yet implemented');
      case 'HISTORY':
        return;
      case 'HELLBORE':
        this.shoot(name, value);
        return;
      case 'ID':
      case 'KILLS':
      case 'LEFT':
        return;
      case 'LOOK':
        this.look = value;
        return;
      case 'MINE':
        this.shoot(name, value);
        return;
      case 'MISSILE':
        this.shoot(name, value);
        return;
      case 'MOVEX':
        this.translate('x', value);
        return;
      case 'MOVEY':
        this.translate('y', value);
        return;
      case 'NUKE':
        this.shoot(name, value);
        return;
      case 'PROBE':
      case 'RADAR':
      case 'RANDOM':
      case 'RANGE':
      case 'RIGHT':
      case 'ROBOTS':
        return;
      case 'SCAN':
        this.scan = fix360(value);
      case 'SHIELD':
        value = Math.max(0, value);
        if (this.shield < value) {
          var cost = value - this.shield;
          if (this.energy < cost) {
            this.shield += (this.energy);
            this.energy = 0;
          } else {
            this.shield = value;
            this.energy -= cost;
          }
        } else if (this.shield > value) {
          var gain = this.shield - value;
          this.shield = value;
          this.energy = Math.min(this.energy + gain, this.max_energy);
        }
        // TODO: storing energy in shield, decays at 2 pts per chronon
        return;
      case 'SIGNAL':
        throw new Error('Teamplay not yet implemented');
      case 'SPEEDX':
        this.set_speed('x', value);
        return;
      case 'SPEEDY':
        this.set_speed('y', value);
        return;
      case 'STUNNER':
        this.shoot(name, value);
        return;
      case 'TEAMMATES':
        throw new Error('Teamplay not yet implemented');
      case 'TOP':
      case 'WALL':
        return;
      case 'X':
      case 'Y':
        throw new Error('Robot tried to teleport by setting X or Y');

      default:
        this.registers[name] = value;
    };
  },

  get_variable: function(name) {
    switch (name) {
      case 'AIM':
        return this.aim;
      case 'BULLET':
        return 0;
      case 'BOTTOM':
      case 'BOT':
        return 0;
      case 'CHANNEL':
        throw new Error('Teamplay not yet implemented');
      case 'CHRONONS':
        return this.chronons;
      case 'COLLISION':
        return this.collision;
      case 'DAMAGE':
        return this.damage;
      case 'DOPPLER':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'ENERGY':
        return this.energy;
      case 'FIRE':
        return 0;
      case 'FRIEND':
        throw new Error('Teamplay not yet implemented');
      case 'HISTORY':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'HELLBORE':
        return 0;
      case 'ID':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'KILLS':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'LEFT':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'LOOK':
        return this.look;
      case 'MINE':
      case 'MISSILE':
      case 'MOVEX':
      case 'MOVEY':
      case 'NUKE':
        return 0;
      case 'PROBE':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'RADAR':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'RANDOM':
        return Math.floor(Math.random() * 360);
      case 'RANGE':
        return this.arena.do_range(this);
      case 'RIGHT':
        return 0;
      case 'ROBOTS':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'SCAN':
        return this.scan;
      case 'SHIELD':
        return this.shield;
      case 'SIGNAL':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'SPEEDX':
        return this.vx;
      case 'SPEEDY':
        return this.vy;
      case 'STUNNER':
        return 0;
      case 'TEAMMATES':
        throw new Error('Teamplay not yet implemented');
      case 'TOP':
        return 0;
      case 'WALL':
        return this.wall ? 1 : 0;
      case 'X':
        return this.x;
      case 'Y':
        return this.y;

      default:
        if (name in this.registers) {
          return this.registers[name];
        }
        if (name in this.program.label_to_address) {
          return this.program.label_to_address[name];
        }
        throw new Error('Unknown variable or label: "' + name + '"');
    }
  },

  step: function() {
    this.chronons++;
    this.energy = Math.min(this.max_energy, this.energy + 2);

    if (this.wall) this.damage -= 5;
    if (this.collision) this.damage -= 1;
    if (this.damage <= 0) this.running = false;
    if (this.energy < -200) this.running = false;

    for (var i = this.speed; i > 0 && this.running; ) {
      try {
        // Some instructions have no cost, like DEBUG, thus they return 0.
        i -= this.step_one();
      } catch (e) {
        var line = this.program.line_numbers[this.ptr];
        var debug = this.program.instructions[this.ptr];
        console.error(this.name, 'error on line ' + line + ', before ' + debug + ' - ' + e);
        this.running = false;
      }
      if (this.energy <= 0) break;
    }

    if (this.energy > 0) {
      var r = this.radius;
      this.x = Math.max(r, Math.min(this.arena.width - r, this.x + this.vx));
      this.y = Math.max(r, Math.min(this.arena.height - r, this.y + this.vy));
    };
  },

  step_one: function() {
    this.debug_stack();
    var instruction = this.program.instructions[this.ptr];
    if (instruction == undefined) {
      throw new Error('Program finished');
    }
    this.trace('Instruction:', instruction.toString());

    this.ptr++;

    if (instruction instanceof Variable) {
      this.stack.push(instruction);
      return 1;
    } else if (instruction instanceof Literal) {
      var value = instruction.value || 0;
      this.stack.push(value);
      return 1;
    } else if (instruction instanceof Operator) {
      return this.handle_operation(instruction);
    }
  },

  push: function(value) {
    this.stack.push(value);
    if (this.stack.length > 100) {
      throw new Error("Stack overflow");
    }
  },

  pop_number: function() {
    if (this.stack.length == 0) {
      throw new Error("Stack is empty");
    }
    var value = this.stack.pop();
    if (isNaN(value)) {
      throw new Error("Invalid value on stack: " + value + " is not a Number");
    } else {
      return value;
    }
  },

  pop_variable: function() {
    if (this.stack.length == 0) {
      throw new Error("Stack is empty");
    }
    var value = this.stack.pop();
    if (!(value instanceof Variable)) {
      throw new Error("Invalid value on stack: " + value + " is not a Variable");
    } else {
      return value;
    }
  },

  pop_variable_value: function() {
    var variable = this.pop_variable();
    return this.get_variable(variable.name);
  },

  op_apply1: function(func) {
    this.push(func(this.pop_number()));
    return 1;
  },

  op_apply2: function(func) {
    var first = this.pop_number();
    var second = this.pop_number();
    this.push(func(first, second));
    return 1;
  },

  op_jump: function(address) {
    this.trace('Go to', this.program.address_to_label[address]);
    this.ptr = address;
    return 1;
  },

  op_call: function(address) {
    this.trace('Jumping to', this.program.address_to_label[address], 'with return');
    var return_addr = this.ptr;
    this.ptr = address;
    this.push(return_addr);
    return 1;
  },

  handle_operation: function(op) {
    var s = this.stack;

    switch (op.name) {
      case '+': return this.op_apply2(function(a, b) { return b + a });
      case '-': return this.op_apply2(function(a, b) { return b - a });
      case '*': return this.op_apply2(function(a, b) { return b * a });
      case '/': return this.op_apply2(function(a, b) { return b / a });
      case '=': return this.op_apply2(function(a, b) { return b == a ? 1 : 0 });
      case '!': return this.op_apply2(function(a, b) { return b != a ? 1 : 0 });
      case '>': return this.op_apply2(function(a, b) { return b > a ? 1 : 0 });
      case '<': return this.op_apply2(function(a, b) { return b < a ? 1 : 0 });
      case 'AND': return this.op_apply2(function(a, b) { return a && b ? 1 : 0 });
      case 'OR': return this.op_apply2(function(a, b) { return a || b ? 1 : 0 });
      case 'XOR': case 'EOR': return this.op_apply2(function(a, b) { return (a ? !b : !!b) ? 1 : 0 });

      case 'ABS': return this.op_apply1(Math.abs);
      case 'CHS': return this.op_apply1(function(x) {return x * -1});
      case 'MAX': return this.op_apply2(function(a, b) { return Math.max(a, b) });
      case 'MIN': return this.op_apply2(function(a, b) { return Math.min(a, b) });
      case 'MOD': return this.op_apply2(function(a, b) { return b % a });
      case 'NOT': return this.op_apply1(function(x) {x ? 1 : 0});
      case 'SQRT': return this.op_apply1(Math.sqrt);

      case 'ARCCOS': throw new Error('TODO: ' + op.name);
      case 'ARCSIN': throw new Error('TODO: ' + op.name);
      case 'ARCTAN': throw new Error('TODO: ' + op.name);
      case 'DIST': throw new Error('TODO: ' + op.name);
      case 'SIN': case 'SINE': throw new Error('TODO: ' + op.name);
      case 'TAN': case 'TANGENT': throw new Error('TODO: ' + op.name);

      case 'STO':
      case 'STORE':
        var v = this.pop_variable();
        this.set_variable(v.name, this.pop_number());
        return 1;
      case 'RECALL':
        this.push(this.pop_variable_value());
        return 1;
      case 'VSTORE':
        var index = this.pop_number();
        var value = this.pop_number();
        this.vector[index] = value;
        return 1;
      case 'VRECALL':
        var index = this.pop_number();
        var value = this.vector[index] || 0;
        this.push((value < 0 || value > 100) ? 0 : value);
        return 1;


      case 'IF':
        var first = this.pop_number();
        var second = this.pop_number();
        if (second) {
          return this.op_call(first);
        }
        return 1;
      case 'IFE':
        var first = this.pop_number();
        var second = this.pop_number();
        var third = this.pop_number();
        if (third) {
          return this.op_call(second);
        } else {
          return this.op_call(first);
        }
      case 'IFG':
        var first = this.pop_number();
        var second = this.pop_number();
        if (second) {
          return this.op_jump(first);
        }
        return 1;
      case 'IFEG':
        var first = this.pop_number();
        var second = this.pop_number();
        var third = this.pop_number();
        if (third) {
          return this.op_jump(second);
        } else {
          return this.op_jump(first);
        }

      case 'CALL':
        return this.op_call(this.pop_number());
      case 'JUMP':
      case 'RETURN':
        return this.op_jump(this.pop_number());

      case 'NOP':
        return 1;
      case 'SYNC':
        // To pause until end of chronon we return maximum "cost".
        return Number.MAX_VALUE;
      case 'DROP':
        this.stack.pop();
        return 1;
      case 'DROPALL':
        this.stack = [];
        return 1;
      case 'SWAP':
        var first = this.pop_number();
        var second = this.pop_number();
        this.push(first);
        this.push(second);
        return 1;

      case 'ROLL': throw new Error('TODO: ' + op.name);

      case 'INTOFF': throw new Error('TODO: ' + op.name);
      case 'INTON': throw new Error('TODO: ' + op.name);
      case 'RTI': throw new Error('TODO: ' + op.name);
      case 'SETINT': throw new Error('TODO: ' + op.name);
      case 'SETPARAM': throw new Error('TODO: ' + op.name);

      case 'BEEP':
        console.log('BEEP!');
        return 0;

      case 'PRINT':
        var size = this.stack.length;
        if (size) {
          console.info('Stack size ' + size + ', top value: ' + this.stack[size - 1]);
        } else {
          console.info('Stack is empty.');
        }
        return 0;

      default:
        throw new Error('Unknown instruction:', op);
    }
  },

});
