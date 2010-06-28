/*
 *  Copyright © 2010 Ian Langworth
 *
 *  This file is part of JSRoboWar.
 *
 *  JSRoboWar is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  JSRoboWar is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with JSRoboWar.  If not, see <http://www.gnu.org/licenses/>.
 */

if (!window.Class) alert('`Class` object missing. base.js is required.');
if (!window.Raphael) alert('`Raphael` object missing. raphael.js is required.');
if (!window._) alert('`_` object missing. underscore.js is required.');

// TODO: Use underscore.js

// TODO: Remove layers -- they're not needed.
var LAYER_ARENA = 0;
var LAYER_ROBOTS = 1;
var LAYER_PROJECTILES = 2;

var Game = Class.extend({

  init: function(arena_el, scoreboard_el) {
    this.paper = Raphael(arena_el, 300, 300);
    this.scoreboard = new Scoreboard(scoreboard_el, this);

    this.clear();
  },

  clear: function() {
    this.paper.clear();

    this.actors = [];
    this.actors[LAYER_ARENA] = [new ArenaView(this.paper, arena)];
    this.actors[LAYER_ROBOTS] = [];
    this.actors[LAYER_PROJECTILES] = [];

    this.robots = [];
    this.projectiles = [];
    this.chronons = 0;
    this.speed = 50;  // 1 chronon is this many ms, minimum.

    this.scoreboard.clear();

    this.arena = new Arena(this, this.paper.width, this.paper.height);
  },

  destroy: function() {
    this.stop();
  },

  add_robot: function(robot) {
    robot.arena = this.arena;

    // Position randomly but away from the edges and not on top of another robot.
    var w = this.arena.width;
    var h = this.arena.height;
    var overlap = true;
    while (overlap) {
      robot.x = parseInt(Math.random() * w * .8 + w * .1);
      robot.y = parseInt(Math.random() * h * .8 + h * .1);
      overlap = false;
      for (var i = 0, other; other = this.robots[i]; i++) {
        overlap = overlap || robot.is_touching(other);
      }
    };

    this.actors[LAYER_ROBOTS].push(new RobotView(this.paper, robot));
    this.robots.push(robot);
  },

  start: function(opt_callback) {
    this.scoreboard.start();

    var w = this.arena.width;
    var h = this.arena.height;
    var self = this;
    var loop;
    loop = function() {
      var start_time = new Date();

      // Increment chronons.
      self.chronons++;

      // Update robots.
      for (var i = 0, robot; robot = self.robots[i]; i++) {
        var x = robot.x, y = robot.y, r = robot.radius;
        robot.wall = (x < r || y < r || x > w - r || y > h - r);
        // XXX Not sure if the above is correct. Should be <=/=> ?

        // Save the current X and Y of the robot in case one tries to move while touching.
        robot.old_x = x;
        robot.old_y = y;

        robot.step();

        if (!robot.is_running) {
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
      // TODO: Use a quadtree.
      var any_colliding = false;
      for (var i = 0, a; a = self.robots[i]; i++) {
        for (var j = 0, b; b = self.robots[j]; j++) {
          if (a == b) continue;
          if (a.is_touching(b)) {
            a.collision = b.collision = any_colliding = true;
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
            p.contact();
            if (p.is_harmful()) {
              self.remove_projectile(p, true);  // Remove if outside arena.
              if (p.is_emp) {
                a.energy = 0;
              } else if (p.is_stasis) {
                a.stasis += parseInt(p.value / 4);
              } else {
                a.damage -= p.value;
              }
            }
          }
        }
      }

      // TODO: Change this when COLLISION interrupt is implemented.
      if (any_colliding) SoundEffects.play_collision();

      self.scoreboard.update();

      if (self.robots.length > 1) {
        // Keep going if more than one bot is alive.
        var elapsed = new Date() - start_time;
        var delay = Math.max(1, Math.min(self.speed, self.speed - elapsed));
        self.next_loop = setTimeout(loop, delay);
      } else {
        // Game has ended.
        self.scoreboard.declare_winner();
        if (opt_callback) opt_callback();
      };
    };
    loop();
  },

  stop: function() {
    if (this.next_loop) clearTimeout(this.next_loop);
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
    SoundEffects.play_death();
    actors[index].animated_remove();
    actors.splice(index, 1);
  },

  add_projectile: function(p) {
    this.projectiles.push(p);
    var actor =
      p instanceof RubberBullet ? new RubberBulletView(this.paper, p) :
      p instanceof NormalBullet ? new NormalBulletView(this.paper, p) :
      p instanceof ExplosiveBullet ? new ExplosiveBulletView(this.paper, p) :
      p instanceof Hellbore ? new HellboreView(this.paper, p) :
      p instanceof Missile ? new MissileView(this.paper, p) :
      p instanceof TacNuke ? new TacNukeView(this.paper, p) :
      p instanceof Mine ? new MineView(this.paper, p) :
      p instanceof Stunner ? new StunnerView(this.paper, p) :
      (function() { throw new Error("Can't make view for projectils: " + p) })();
    this.actors[LAYER_PROJECTILES].push(actor);
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
      SoundEffects.play_hit();
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

  find_nearest_object: function(observer, direction, objects) {
    // A port of RoboWar 4.5.2's Engine/Projectile.c radar()
    var theta, range, close = Number.MAX_VALUE, close_obj;
    var x = observer.x;
    var y = observer.y;
    var scan = fix360(direction);

    for (var i = 0, cur; cur = objects[i]; i++) {
      if (cur == observer) continue;

      theta = parseInt((450 - rad2deg(Math.atan2(y-cur.y, cur.x-x))) % 360);

      if ((Math.abs(theta - scan) < 20) || (Math.abs(theta - scan) > 340)) {
        range = (y - cur.y) * parseInt(y - cur.y) +
            (x - cur.x) * parseInt(x - cur.x);
        if (range < close) {
          close = range;
          close_obj = cur;
        }
      }
    }

    if (close == Number.MAX_VALUE) result = 0;
    else result = Math.sqrt(close);
    return {object: close_obj, distance: result};
  },

  find_nearest_robot: function(observer, direction) {
    return this.find_nearest_object(observer, direction, this.robots);
  },

  find_nearest_projectile: function(observer, direction) {
    return this.find_nearest_object(observer, direction, this.game.projectiles);
  },

  do_range: function(robot) {
    var direction = fix360(robot.aim + robot.scan);
    return this.find_nearest_robot(robot, direction).distance;
  },

  do_radar: function(robot) {
    var direction = fix360(robot.aim + robot.look);
    return this.find_nearest_projectile(robot, direction).distance;
  },

  do_doppler: function(robot) {
    var direction = fix360(robot.aim + robot.look);
    var enemy = this.find_nearest_projectile(robot, direction).distance;
    if (!enemy) return 0;

    // The following is stolen from Robowar 4.5.2's Projectiles.c.
    var dist = 0;
    var target, doppler, tmp;
    var m = Math.sin((robot.aim + robot.look + 270) % 360);
    var n = -Math.sin((robot.aim + robot.look) % 360);

    for (var i = 0, enemy; enemy = this.game.robots[i]; i++) {
      if (enemy == robot || !enemy.is_running) continue;
        var a = robot.x;
        var b = robot.y;
        var c = enemy.x;
        var d = enemy.y;
        var t = (m*c + n*d - m*a -n*b); /* /(m*m+n*n) deleted because it seems to equal 1 */
        if (t > 0 &&
          (m*t+a-c)*(m*t+a-c)+
          (n*t+b-d)*(n*t+b-d)<
          (robot.radius * robot.radius - 9)) /* in sights */
          if (dist == 0 || t < dist) {
            dist = t;
            target = enemy;
            if (target.energy < 0 || target.stasis ||
              target.collision || target.wall) doppler = 0;
            else {
              a = (a-c); /* a = rx */
              b = (b-d); /* b = ry */
              c = (a*target.vx + b*target.vy); /* c = r¥v */
              t = (target.vx*target.vx+ target.vy*target.vy) - (c*c) / (a*a+b*b);
              tmp = Math.sqrt(t);
              if (tmp-parseInt(tmp) > 0.5) tmp+=1.0;
              doppler = (a*target.vy-b*target.vx) > 0 ?
                -tmp : tmp;
            }
          }
      }

    // TODO: Teamplay.
    //if (who->team && who->team == rob[target].team)
    //  dist = 0;  /* Don't shoot own team member */

    return dist==0 ? 0 : doppler;
  },

  count_active_robots: function() {
    var count = 0;
    for (var i = 0, robot; robot = this.robots[i]; i++) {
      if (robot.is_running) count++;
    }
    return count;
  },

  create_projectile: function(type, energy) {
    switch (type) {
      case 'RUBBER_BULLET':
        SoundEffects.play_gun();
        return new RubberBullet(energy);
      case 'NORMAL_BULLET':
        SoundEffects.play_gun();
        return new NormalBullet(energy);
      case 'EXPLOSIVE_BULLET':
        SoundEffects.play_gun();
        return new ExplosiveBullet(energy);
      case 'HELLBORE':
        SoundEffects.play_hellbore();
        return new Hellbore(energy);
      case 'MINE':
        SoundEffects.play_mine();
        return new Mine(energy);
      case 'MISSILE':
        SoundEffects.play_missile();
        return new Missile(energy);
      case 'NUKE':
        SoundEffects.play_nuke();
        return new TacNuke(energy);
      case 'STUNNER':
        return new Stunner(energy);
      default: throw new Error('Unknown bullet type: ' + type);
    }
  },

  shoot: function(robot, type, energy) {
    var aim_radians = robot.aim * (Math.PI + Math.PI) / 360;
    var radius = robot.radius + 7;

    var p = this.create_projectile(type, energy);
    p.x = robot.x + Math.sin(aim_radians) * radius;
    p.y = robot.y - Math.cos(aim_radians) * radius;
    p.energy = energy;
    p.speedx = Math.sin(aim_radians) * p.speed;
    p.speedy = -Math.cos(aim_radians) * p.speed;

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
    this.value = 0;
    this.speed = 12;
    this.speedx = 0; // Set by caller.
    this.speedy = 0; // Set by caller.
    this.is_emp = false;
    this.is_stasis = false;
  },

  contact: function() {
  },

  is_harmful: function() {
    return true;
  },

  step: function() {
    this.x += this.speedx;
    this.y += this.speedy;
  },

});

var Mine = Projectile.extend({

  init: function(energy) {
    this._super();
    this.value = 2 * Math.max(0, energy - 5);
    this.speed = 0;
    this.chronons = 0;
    this.radius = 5;
  },

  step: function() {
    this._super();
    this.chronons++;
  },

  is_harmful: function() {
    return this.chronons > 10;
  }

});

var TacNuke = Mine.extend({

  init: function(energy) {
    this._super();
    this.value = 2 * energy;
    this.radius = 1;
  },

  step: function() {
    this._super();
    this.radius = this.chronons * 5;
  },

});

var Missile = Projectile.extend({

  init: function(energy) {
    this._super();
    this.value = energy * 2;
    this.speed = 5;
  },

});

var Stunner = Projectile.extend({

  init: function(energy) {
    this._super();
    this.value = parseInt(energy / 4);
    this.speed = 14;
    this.is_stasis = true;
  },

});

var Hellbore = Projectile.extend({

  init: function(energy) {
    this._super();
    this.speed = Math.min(20, Math.max(4, energy));
    this.is_emp = true;

    if (this.speed != energy)
      throw new Error('Hellbore value must be between 4 and 20, inclusive');
  },

});

var RubberBullet = Projectile.extend({

  init: function(energy) {
    this._super();
    this.value = parseInt(energy / 2);
  },

});

var NormalBullet = Projectile.extend({

  init: function(energy) {
    this._super();
    this.value = energy;
  },

});

var ExplosiveBullet = Projectile.extend({

  init: function(energy) {
    this._super();
    this.value = energy * 2;
    this.exploded = false;
    this.time_since_exploded = 0;
  },

  step: function() {
    if (this.exploded) {
      this.time_since_exploded++;
      this.radius = 12 * this.time_since_exploded;
    } else {
      return this._super();
    }
  },

  contact: function() {
    if (!this.exploded) {
      this.exploded = true;
      this.time_since_exploded = 1;
      this.radius = 12;
    }
  },

  is_harmful: function() {
    if (this.exploded) {
      return this.time_since_exploded >= 3;
    } else {
      return false;
    }
  }

});

var ProjectileView = Actor.extend({

  init: function(paper, projectile) {
    this.paper = paper; // Do not use except for debugging.
    this.projectile = projectile;

    this.el = this.get_element();

    this.old_x = this.projectile.x;
    this.old_y = this.projectile.y;
    this.old_harmful = this.projectile.is_harmful();
  },

  get_element: function() {
    var p = this.projectile;
    return this.paper.circle(p.x, p.y, p.radius).attr(this.get_attr());
  },

  get_attr: function() {
    return {fill: 'black', stroke: null};
  },

  update: function() {
    var dx = this.projectile.x - this.old_x;
    var dy = this.projectile.y - this.old_y;

    this.el.translate(dx, dy);
    //this.XXX.circle(this.projectile.x, this.projectile.y, 1).attr({fill: '#0f0', stroke: null});

    this.old_x = this.projectile.x;
    this.old_y = this.projectile.y;

    // This can probably be optimized -- check if method exists first.
    var current = this.projectile.is_harmful();
    if (this.old_harmful != current) {
      this.old_harmful = current;
      this.update_harmfulness(current);
    }
  },

  update_harmfulness: function(value) {},

  animated_remove: function() {
    var self = this;
    this.el.attr({scale: 2, fill: 'orange', stroke: 'none'});
    var attr = {scale: 7, opacity: 0};
    this.el.animate(attr, 200, function() {self.remove()});
  },

});

var MissileView = ProjectileView.extend({
  get_element: function() {
    var p = this.projectile;
    var x1 = p.x - p.speedx;
    var y1 = p.y - p.speedy;
    var x2 = p.x + p.speedx;
    var y2 = p.y + p.speedy;

    var line = this.paper.path('M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2);
    line.attr({stroke: 'black', 'stroke-width': '1px'});
    return line;
  },
  get_attr: function() {
    return {fill: 'white', stroke: 'black'};
  },
  animated_remove: function() {
    var p = this.projectile;
    this.el.remove();
    this.el = this.paper.circle(p.x, p.y, p.radius * 2);
    this._super();
  },
});

var MineView = ProjectileView.extend({
  get_element: function() {
    var p = this.projectile;
    this.outer = this.paper.circle(p.x, p.y, p.radius);
    this.outer.attr({fill: 'green', stroke: 'black', 'stroke-width': '1px'});
    this.inner = this.paper.circle(p.x, p.y, p.radius * 0.4);
    this.inner.attr({fill: 'black', stroke: 'none'});
    return this.paper.set(this.outer, this.inner);
  },
  update_harmfulness: function(is_harmful) {
    this.outer.attr({fill: 'white'});
  },
});

var TacNukeView = ProjectileView.extend({
  get_attr: function() {
    return {fill: 'yellow', stroke: 'none'};
  },
  update: function() {
    this._super();
    this.el.attr('r', this.projectile.radius);
  },
  animated_remove: function() {
    var self = this;
    this.el.animate({opacity: 0}, 200, function() {self.remove()});
  },
});

var StunnerView = ProjectileView.extend({
  get_attr: function() {
    return {fill: 'yellow', stroke: 'none'};
  },
});

var HellboreView = ProjectileView.extend({
  get_attr: function() {
    return {fill: 'cyan', stroke: 'black'};
  },
});

var RubberBulletView = ProjectileView.extend({
  get_attr: function() {
    return {fill: 'white', stroke: 'black'};
  },
});

var NormalBulletView = ProjectileView.extend({
  get_attr: function() {
    return {fill: 'black', stroke: null};
  },
});

var ExplosiveBulletView = ProjectileView.extend({

  get_attr: function() {
    return {fill: 'red', stroke: 'black'};
  },

  update: function() {
    this._super();
    if (this.projectile.exploded) {
      this.el.attr({
        fill: 'orange',
        r: this.projectile.radius,
        stroke: 'none',
      });
    }
  },

  animated_remove: function() {
    var self = this;
    this.el.animate({opacity: 0}, 200, function() {self.remove()});
  },

});


var ArenaView = Actor.extend({
  init: function(paper, arena) {
    this.el = paper
      .rect(0, 0, paper.width, paper.height)
      .attr({ fill: '#666', stroke: '#666' });
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
    return this.name;
  },

});

var Literal = Instruction.extend({

  init: function(value) {
    this.value = value;
  },

  toString: function() {
    return this.value;
  },

});

var Variable = Instruction.extend({

  init: function(name) {
    this.name = name;
  },

  toString: function() {
    return this.name;
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

    // Turn extended comments ("{..}") into hash comments. This makes the
    // comments ignored by the parser while preserving line numbers.
    var commentify = function(str) { return str.replace(/\S/g, '#') };
    source = source.replace(/\{[\s\S]*?\}/gm, commentify); // Yeah, "." doesn't work here.

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
      if (!_.isNaN(value)) {
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

var INTERRUPTS = {
  // Values are each interrupt's priority level.
  COLLISION: 1,
  WALL: 2,
  DAMAGE: 3,
  SHIELD: 4,
  TOP: 5,
  BOTTOM: 6,
  LEFT: 7,
  RIGHT: 8,
  RADAR: 9,
  RANGE: 10,
  TEAMMATES: 11,
  ROBOTS: 12,
  SIGNAL: 13,
  CHRONON: 14,
};

var InterruptQueue = Class.extend({

  init: function() {
    this.enabled = false;
    this.queue = [];

    this.params = {
        DAMAGE: 150,
        SHIELD: 25,
        TOP: 20,
        BOTTOM: 280,  // TODO: Get data from arena.
        LEFT: 20,
        RIGHT: 280,
        RADAR: 600,
        RANGE: 600,
        TEAMMATES: 5,
        ROBOTS: 6,
        SIGNAL: 0,
        CHRONON: 0,
      };

    this.ptrs = {};
    for (name in INTERRUPTS) {
      this.ptrs[name] = -1;
    }
  },

  normalize: function(name) {
    // Guarantees that the result is a valid interrupt name.
    if (name == 'BOT') name = 'BOTTOM';
    if (name in INTERRUPTS)
      return name;
    else
      throw new Error('Unknown interrupt name: "' + name + '"');
  },

  get_param: function(name) {
    return this.params[this.normalize(name)];
  },

  set_param: function(name, value) {
    this.params[this.normalize(name)] = value;
  },

  get_ptr: function(name) {
    return this.ptrs[this.normalize(name)];
  },

  set_ptr: function(name, value) {
    this.ptrs[this.normalize(name)] = value;
  },

  add: function(name) {
    name = this.normalize(name);
    // TODO: Use a priority queue. Duh.
    this.queue.unshift(name);
    this.queue = unique(this.queue);
    this.queue = this.queue.sort(function(a, b) { return INTERRUPTS[a] - INTERRUPTS[b] });
  },

  flush: function() {
    this.queue = [];
  },

  has_next: function() {
    if (this.queue.length == 0) return false;

    // Use this call to prune any interrupts that point to address -1.
    while (this.queue.length > 0) {
      var next = this.queue[0];
      if (this.ptrs[next] == -1)
        this.queue.shift(); // Remove it!
      else
        return true;
    }
    return false;  // I guess they all pointed to -1...
  },

  next: function() {
    if (this.queue.length)
      return this.queue.shift();
    else
      throw new Error('Internal error: Tried getting next interrupt signal but none queued');
  },

});

// These are defined in robowar.pdf under 'HISTORY'
var HISTORY_ELEMENTS = {
  NUM_BATTLES: 1,
  PREV_BATTLE_KILLS: 2,
  ALL_BATTLE_KILLS: 3,
  PREV_BATTLE_POINTS: 4,
  ALL_BATTLE_POINTS: 5,
  LAST_BATTLE_TIMED_OUT: 6,
  LAST_BATTLE_TEAMMATES_ALIVE: 7,
  ALL_BATTLE_TEAMMATES_ALIVE: 8,
  LAST_BATTLE_DAMAGE_REMAINING: 9,
  LAST_BATTLE_CHRONONS: 10,
  ALL_BATTLE_CHRONONS: 11,
};

var Robot = Class.extend({

  init: function(name, color, program) {
    this.name = name;
    this.color = color;
    this.program = program;
    this.speed = 10;
    this.is_running = true;
    this.chronons = 0;
    this.radius = 8;
    this.max_energy = 150;
    this.max_shield = 30;
    this.starting_damage = 100;
    this.bullet_type = 'NORMAL';
    this.set_trace(false);

    this.registers = {};
    this.vector = [];
    this.stack = [];
    this.ptr = 0;
    this.last_ptr = 0;
    this.interrupts = new InterruptQueue();

    this.probe_variable = new Variable('DAMAGE');
    this.history_index;
    this.history = [];
    for (var i = 1; i <= 50; i++) this.history[i] = 0;

    this.aim = 90;
    this.scan = 0;
    this.look = 0;
    this.energy = this.max_energy;
    this.damage = this.starting_damage;
    this.shield = 0;
    this.stasis = 0;
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
    return output;
  },

  take_damage: function(amount) {
    if (amount <= this.shield) {
      this.shield -= amount;
    } else {
      var remainder = amount - this.shield;
      this.shield = 0;
      this.damage -= remainder;
    }
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
    amount = Math.min(amount, this.max_energy);
    this.arena.shoot(this, type, amount);
    this.energy -= parseInt(amount);
    // TOOD can't move and shoot
  },

  do_probe: function() {
    var direction = fix360(this.aim);
    var result = this.arena.find_nearest_robot(this, direction);
    var robot = result.object;
    if (!robot) return 0;

    switch (this.probe_variable.name) {
      case 'DAMAGE': return robot.damage;
      case 'ENERGY': return robot.energy;
      case 'SHIELD': return robot.shield;
      case 'ID': return robot.id;
      case 'TEAMMATES': throw new Error('Teamplay not yet implemented');
      case 'AIM': return robot.aim;
      case 'LOOK': return robot.look;
      case 'SCAN': return robot.scan;
      default: throw new Error('Uknown probe variable: ' + this.probe_variable);
    }
  },

  teleport: function(axis, energy) {
    var distance = parseInt(energy / 2);
    this.energy -= parseInt(energy);
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
    value = parseInt(Math.max(-20, Math.min(20, value))); // TODO warn here?
    switch (axis) {
      case 'x':
        var difference = Math.abs(this.vx - value) * 2;
        this.energy -= difference;
        this.vx = value;
        break;
      case 'y':
        var difference = Math.abs(this.vy - value) * 2;
        this.energy -= difference;
        this.vy = value;
        break;
    }
    // TOOD can't move and shoot
  },

  set_variable: function(name, value) {
    switch (name) {
      case 'AIM':
        this.aim = fix360(value);
        this.check_radar_interrupt();
        this.check_range_interrupt();
        return;
      case 'BULLET':
        if (this.bullet_type == 'EXPLOSIVE')
          this.shoot('NORMAL_BULLET', value);
        else
          this.shoot(this.bullet_type + '_BULLET', value);
        return;
      case 'BOTTOM':
      case 'BOT':
        return;
      case 'CHANNEL':
        throw new Error('Teamplay not yet implemented');
      case 'CHRONON':
      case 'COLLISION':
      case 'DAMAGE':
      case 'DOPPLER':
        return;
      case 'DRONE':
        throw new Error('Drones are not supported as of RoboWar 2.4');
      case 'ENERGY':
        return;
      case 'FIRE':
        this.shoot(this.bullet_type + '_BULLET', value);
        return;
      case 'FRIEND':
        throw new Error('Teamplay not yet implemented');
      case 'HISTORY':
        return;
      case 'HELLBORE':
        this.shoot(name, value);
        return;
      case 'ICON0':
      case 'ICON1':
      case 'ICON2':
      case 'ICON3':
      case 'ICON4':
      case 'ICON5':
      case 'ICON6':
      case 'ICON7':
      case 'ICON8':
      case 'ICON9':
        return;
      case 'ID':
      case 'KILLS':
        return;
      case 'LASER':
        throw new Error('Lasers are not supported as of RoboWar 2.4');
      case 'LEFT':
        return;
      case 'LOOK':
        this.check_radar_interrupt();
        this.look = value;
        return;
      case 'MINE':
        this.shoot(name, value);
        return;
      case 'MISSILE':
        this.shoot(name, value);
        return;
      case 'MOVEX':
        this.teleport('x', value);
        return;
      case 'MOVEY':
        this.teleport('y', value);
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
        this.check_range_interrupt();
        this.scan = fix360(value);
        return;
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
      case 'SND0':
      case 'SND1':
      case 'SND2':
      case 'SND3':
      case 'SND4':
      case 'SND5':
      case 'SND6':
      case 'SND7':
      case 'SND8':
      case 'SND9':
        return;
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
    // Resolve label names first. Some simpler bots have label names with the
    // same name as variables.
    if (name in this.program.label_to_address) {
      return this.program.label_to_address[name];
    }

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
      case 'CHRONON':
        return this.chronons;
      case 'COLLISION':
        return this.collision ? 1 : 0;
      case 'DAMAGE':
        return this.damage;
      case 'DOPPLER':
        return this.arena.do_doppler(this);
      case 'ENERGY':
        return this.energy;
      case 'FIRE':
        return 0;
      case 'FRIEND':
        throw new Error('Teamplay not yet implemented');
      case 'HISTORY':
        return this.history[this.history_index] || 0;
      case 'HELLBORE':
        return 0;
      case 'ICON0':
      case 'ICON1':
      case 'ICON2':
      case 'ICON3':
      case 'ICON4':
      case 'ICON5':
      case 'ICON6':
      case 'ICON7':
      case 'ICON8':
      case 'ICON9':
        return 0;
      case 'ID':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'KILLS':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'LEFT':
        return 0;
      case 'LOOK':
        return this.look;
      case 'MINE':
      case 'MISSILE':
      case 'MOVEX':
      case 'MOVEY':
      case 'NUKE':
        return 0;
      case 'PROBE':
        return this.do_probe();
      case 'RADAR':
        return this.arena.do_radar(this);
      case 'RANDOM':
        return parseInt(Math.random() * 360);
      case 'RANGE':
        return this.arena.do_range(this);
      case 'RIGHT':
        return 0;
      case 'ROBOTS':
        return this.arena.count_active_robots();
      case 'SCAN':
        return this.scan;
      case 'SHIELD':
        return this.shield;
      case 'SIGNAL':
        throw new Error('TODO: get_variable(' + name + ')');
      case 'SND0':
      case 'SND1':
      case 'SND2':
      case 'SND3':
      case 'SND4':
      case 'SND5':
      case 'SND6':
      case 'SND7':
      case 'SND8':
      case 'SND9':
        return 0;
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

        // Allow for undefined A-Z registers.
        if (name.match(/[A-Z]$/)) return 0;

        throw new Error('Unknown variable or label: "' + name + '"');
    }
  },

  step: function() {
    this.chronons++;
    this.trace('------ ' + this.chronons + ' ------');

    if (this.stasis > 0) {
      this.stasis--;
      this.trace('In stasis for ' + this.stasis + ' more chronons');
      return;
    }

    this.energy = Math.min(this.max_energy, this.energy + 2);

    if (this.wall) this.take_damage(5);
    if (this.collision) this.take_damage(1);
    if (this.damage <= 0) this.is_running = false;
    if (this.energy < -200) this.is_running = false;

    if (this.shield > this.max_shield)
      this.shield = Math.max(0, this.shield - 2.0);
    else if (this.shield > 0)
      this.shield = Math.max(0, this.shield - 0.5);

    if (this.interrupts.enabled) {
      if (this.collision) {
        if (!this.was_already_colliding) {
          this.interrupts.add('COLLISION');
          this.was_already_colliding = true;
        } else {
          this.was_already_colliding = false;
        }
      }
      if (this.wall) {
        if (!this.was_already_on_wall) {
          this.interrupts.add('WALL');
          this.was_already_on_wall = true;
        } else {
          this.was_already_on_wall = false;
        }
      }

      if (this.damage < this.interrupts.get_param('DAMAGE'))
        this.interrupts.add('DAMAGE');
      if (this.shield < this.interrupts.get_param('SHIELD'))
        this.interrupts.add('SHIELD');

      if (this.y < this.interrupts.get_param('TOP')) {
        if (!this.was_already_at_top) {
          this.interrupts.add('TOP');
          this.was_already_at_top = true;
        }
      } else {
        this.was_already_at_top = false;
      }
      if (this.y > this.interrupts.get_param('BOTTOM')) {
        if (!this.was_already_at_bottom) {
          this.interrupts.add('BOTTOM');
          this.was_already_at_bottom = true;
        }
      } else {
        this.was_already_at_bottom = false;
      }
      if (this.x < this.interrupts.get_param('LEFT')) {
        if (!this.was_already_at_left) {
          this.interrupts.add('LEFT');
          this.was_already_at_left = true;
        }
      } else {
        this.was_already_at_left = false;
      }
      if (this.x > this.interrupts.get_param('RIGHT')) {
        if (!this.was_already_at_right) {
          this.interrupts.add('RIGHT');
          this.was_already_at_right = true;
        }
      } else {
        this.was_already_at_right = false;
      }

      this.check_radar_interrupt();
      this.check_range_interrupt();

      // TODO: TEAMMATES interrupt. Teamplay not yet implemented.
      // TODO: SIGNAL interrupt. Teamplay not yet implemented.
      // TODO: ROBOTS interrupt.

      if (this.chronons >= this.interrupts.get_param('CHRONON')) {
        this.interrupts.add('CHRONON');
      }
    }

    for (var i = this.speed; i > 0 && this.is_running; ) {
      if (this.energy <= 0) {
        this.trace('Robot has no energy');
        break;
      }
      try {
        if (this.interrupts.enabled && this.interrupts.has_next()) {
          this.interrupts.enabled = false;
          var next = this.interrupts.next();
          this.trace('Executing interrupt ' + next);
          this.op_call(this.interrupts.get_ptr(next));
        }
        // Some instructions have no cost, like DEBUG, thus they return 0.
        i -= this.step_one();
      } catch (e) {
        var line = this.program.line_numbers[this.last_ptr];
        var instruction = this.program.instructions[this.last_ptr];
        console.error(this.name, 'error on line ' + line + ', at ' + instruction + ' - ' + e);
        console.log(e.stack);
        this.is_running = false;
      }
    }

    var r = this.radius;
    this.x = Math.max(r, Math.min(this.arena.width - r, this.x + this.vx));
    this.y = Math.max(r, Math.min(this.arena.height - r, this.y + this.vy));

    this.was_already_colliding = this.collision;
    this.was_already_on_wall = this.wall;
  },

  step_one: function() {
    this.debug_stack();
    var instruction = this.program.instructions[this.ptr];
    if (this.ptr >= this.program.instructions.length)
      throw new Error('Program finished');
    if (instruction == undefined)
      throw new Error('Undefined instruction');
    this.trace(
      pad('L' + this.program.line_numbers[this.ptr], 6),
      pad('' + instruction.toString(), 15),
      this.debug_stack());

    this.last_ptr = this.ptr;
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

  check_radar_interrupt: function() {
    var radar = this.arena.do_radar(this);
    if (radar != 0 && radar <= this.interrupts.get_param('RADAR'))
      this.interrupts.add('RADAR');
  },

  check_range_interrupt: function() {
    var range = this.arena.do_range(this);
    if (range != 0 && range <= this.interrupts.get_param('RANGE'))
      this.interrupts.add('RANGE');
  },

  push: function(value) {
    // TODO: Truncate decimals.
    if (value == undefined)
      throw new Error('undefined pushed onto the stack');
    this.stack.push(value);
    if (this.stack.length > 100) {
      throw new Error('Stack overflow');
    }
  },

  pop_number: function() {
    if (this.stack.length == 0) {
      throw new Error('Stack underflow');
    }
    var value = this.stack.pop();
    if (_.isNaN(value)) {
      throw new Error('Invalid value on stack: ' + value + ' is not a Number');
    } else {
      return value;
    }
  },

  pop_variable: function() {
    if (this.stack.length == 0) {
      throw new Error('Stack underflow');
    }
    var value = this.stack.pop();
    if (!(value instanceof Variable)) {
      throw new Error('Invalid value on stack: ' + value + ' is not a Variable');
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
    address = parseInt(address);
    this.trace('Go to', this.program.address_to_label[address]);
    this.ptr = address;
    return 1;
  },

  op_call: function(address) {
    address = parseInt(address);
    this.trace('Jumping to', this.program.address_to_label[address], 'with return');
    var return_addr = this.ptr;
    this.ptr = address;
    this.push(return_addr);
    return 1;
  },

  op_trig: function(func) {
    return this.op_apply2(function(a, b) { return func(deg2rad(b)) * a });
  },

  op_arctrig: function(op, func) {
    return this.op_apply2(function(a, b) {
      var ratio = b / a;
      if (ratio < -1 || ratio > 1)
        throw new Error('-1 < Num / Denom < 1 for ' + op.name);
      return rad2deg(func(ratio));
    });
  },

  handle_operation: function(op) {
    var s = this.stack;

    switch (op.name) {
      case '+': return this.op_apply2(function(a, b) { return b + a });
      case '-': return this.op_apply2(function(a, b) { return b - a });
      case '*': return this.op_apply2(function(a, b) { return b * a });
      case '/': return this.op_apply2(function(a, b) { return parseInt(b / a) });
      case '=': return this.op_apply2(function(a, b) { return b == a ? 1 : 0 });
      case '!': return this.op_apply2(function(a, b) { return b != a ? 1 : 0 });
      case '>': return this.op_apply2(function(a, b) { return b > a ? 1 : 0 });
      case '<': return this.op_apply2(function(a, b) { return b < a ? 1 : 0 });

      case 'AND': return this.op_apply2(function(a, b) { return a && b ? 1 : 0 });
      case 'OR': return this.op_apply2(function(a, b) { return a || b ? 1 : 0 });
      case 'XOR': case 'EOR':
        return this.op_apply2(function(a, b) { return (a ? !b : !!b) ? 1 : 0 });

      case 'ABS': return this.op_apply1(Math.abs);
      case 'CHS': return this.op_apply1(function(x) {return x * -1});
      case 'MAX': return this.op_apply2(function(a, b) { return Math.max(a, b) });
      case 'MIN': return this.op_apply2(function(a, b) { return Math.min(a, b) });
      case 'MOD': return this.op_apply2(function(a, b) { return b % a });
      case 'NOT': return this.op_apply1(function(x) {return !x ? 1 : 0});
      case 'SQRT': return this.op_apply1(Math.sqrt);

      case 'SIN': case 'SINE': return this.op_trig(Math.sin);
      case 'COS': case 'COSSINE': return this.op_trig(Math.cos);
      case 'TAN': case 'TANGENT': return this.op_trig(Math.tan);
      case 'ARCSIN': return this.op_arctrig(op, Math.asin);
      case 'ARCCOS': return this.op_arctrig(op, Math.acos);
      case 'ARCTAN':
        var y = this.pop_number();
        var x = this.pop_number();
        var result = Math.atan2(-y, x);  // Flip Y coord.
        // Robowar's Engine/Arena.c does this, so I will:
        this.push(parseInt(450.5 - rad2deg(result)) % 360);
        return 1;
      case 'DIST':
        var dy = this.y - this.pop_number();
        var dx = this.x - this.pop_number();
        return Math.sqrt( (dx * dx) + (dy * dy) );

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
      case 'DUP':
      case 'DUPLICATE':
        var value = this.pop_number();
        this.stack.push(value);
        this.stack.push(value);
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
      case 'ROLL':
        var count = this.pop_number();
        var value = this.pop_number();
        if (count > this.stack.length)
          throw new Error('Tried rolling back ' + count + ' places, but ' +
              'only ' + this.stack.length + ' items are in the stack.')
        var temp = [];
        for (var i = 0; i < count; i ++)
          temp.push(this.stack.pop());
        this.stack.push(value);
        for (var i = 0; i < count; i ++)
          this.stack.push(temp.pop());
        return 1;

      case 'INTON':
        this.interrupts.enabled = true;
        return 1;
      case 'INTOFF':
        this.interrupts.enabled = false;
        return 1;
      case 'FLUSHINT':
        this.interrupts.flush();
        return 1;
      case 'RTI': // Equivalent to INTON RETURN
        this.interrupts.enabled = true;
        this.op_jump(this.pop_number());
        return 2;
      case 'SETINT':
        var v = this.pop_variable();
        var address = this.pop_number();
        this.interrupts.set_ptr(v.name, address);
        return 1;
      case 'SETPARAM':
        var v = this.pop_variable();
        if (v.name == 'HISTORY') {
          var value = this.pop_number();
          this.history_index = value;
        } else if (v.name == 'PROBE') {
          var value = this.pop_variable();
          this.probe_variable = value;
        } else {
          var value = this.pop_number();
          this.interrupts.set_param(v.name, value);
        }
        return 1;

      case 'DEBUG':
      case 'DEBUGGER':
        // TODO: Debugging.
        return 0;
      case 'BEEP':
        console.info('BEEP!');
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
        throw new Error('Unknown instruction: ' + op.name);
    }
  },

});

var Scoreboard = Class.extend({

  init: function(scoreboard_el, game) {
    this.paper = Raphael(scoreboard_el, 250, 250);
    this.game = game;

    this.clear();
  },

  clear: function() {
    this.paper.clear();
  },

  start: function() {
    var p = this.paper;

    var PAD = 12;
    var y = PAD;
    var attr = {fill: 'black', 'text-anchor': 'start', 'font-size': PAD + 'px'};

    var bg = p.rect(0, 0, p.width, p.height).attr({ fill: 'white', stroke: null });

    var title = p.text(PAD, y, 'JSRoboWar').attr(attr).attr('font-size', '20px');
    y += PAD * 2;

    this.counter = p.text(PAD, y, 'Chronons: 0').attr(attr);
    y += PAD * 2;

    var labels = [];
    for (var i = 0, robot; robot = this.game.robots[i]; i++) {
      p.rect(0, y - PAD, p.width, PAD * 4).attr({fill: robot.color, stroke: null});
      labels.push({
        robot: robot,
        name: p.text(PAD, y + PAD * 0, robot.name).attr(attr).attr('font-weight', 'bold'),
        energy: p.text(PAD, y + PAD * 1, '').attr(attr),
        damage: p.text(p.width / 2, y + PAD * 1, '').attr(attr),
        shield: p.text(PAD, y + PAD * 2, '').attr(attr),
        status: p.text(p.width / 2, y + PAD * 2, '').attr(attr),
      });
      y += PAD * 4;
    }
    this.labels = labels;
  },

  update: function() {
    this.counter.attr('text', 'Chronons: ' + this.game.chronons);
    for (var i = 0, label; label = this.labels[i]; i++) {
      var robot = label['robot'];
      label['energy'].attr('text', 'Energy: ' + robot.energy);
      label['damage'].attr('text', 'Damage: ' + robot.damage);
      label['shield'].attr('text', 'Shield: ' + robot.shield);
      label['status'].attr('text', 'Status: ' + (
        robot.energy < 0 ? 'NO ENERGY' :
        robot.stasis > 0 ? 'STASIS' :
        robot.wall ? 'WALL' :
        robot.collision ? 'COLLISION' :
        robot.is_running ? 'alive' :
        'DEAD'));
    }
  },

  declare_winner: function() {
    for (var i = 0, label; label = this.labels[i]; i++) {
      var robot = label['robot'];
      if (label['robot'].is_running) {
        label['status'].attr('text', 'Status: WINNER');
      }
    }
  },

});

var SoundEffects = (function() {

  var sounds = {
    collision: "Collision",
    death: "Death",
    drone: "Drone",
    gun: "Gun",
    hellbore: "Hellbore",
    laser: "Laser",
    mine: "Mine",
    missile: "Missile",
    nuke: "NukeBang",
    hit: "Shot_Hit",
  };

  function load(name) {
    return new Audio("sounds/" + sounds[name] + ".mp3")
  }

  function make_play_callback(name) {
    // TODO: Fix audio to be less terrible.
    //return function() { load(name).play() };
    return function() {};
  }

  var obj = new Object();
  var preload = {};

  for (var name in sounds) {
    preload[name] = load(name);
    obj["play_" + name] = make_play_callback(name);
  }

  return obj;

})();

function fix360(value) {
  value %= 360;
  return (value < 0) ? 360 + value : value;
}

function deg2rad(degrees) {
  return degrees * (Math.PI / 180);
}

function rad2deg(radians) {
  return parseInt(radians * (180 / Math.PI));
}

function unique(seq) {
  var o = {}, a = [];
  for (var i = 0; i < seq.length; i++) o[seq[i]] = 1;
  for (var e in o) a.push(e);
  return a;
}

function pad(str, length) {
  while (str.length < length)
    str = str + ' ';
  return str;
}
