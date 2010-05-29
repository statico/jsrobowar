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

var Game = Class.extend({

  init: function(canvas) {
    this.canvas = canvas;
    this.robots = [];
  },

  add: function(robot) {
    this.robots.push(robot);
  },

  start: function() {
    var self = this;
    var chronons = 0;
    var loop;
    loop = function() {
      chronons++;
      console.log('Chronon: ' + chronons);

      var num_running = 0;
      for (var i = 0, robot; robot = self.robots[i]; i++) {
        console.log('Robot: ', robot.name);
        robot.vm.step();
        if (robot.vm.running) num_running++;
      }
      if (num_running > 1) {
        setTimeout(loop, 1000);
      }
    };
    loop();
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

var Value = Instruction.extend({

  init: function(value) {
    this.value = value;
  },

  toString: function() {
    return "Value: " + this.value;
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
    this.instruction_lines = [];
    this.labels = {};
  },

  parse: function(source) {
    var counter = 0;
    var line_number = 0;
    var self = this;

    function push_instruction(i) {
      self.instructions.push(i);
      self.instruction_lines.push(line_number);
      counter++;
    }

    function parse_token(token) {
      var match = token.match(/(\w+):$/);
      if (match) {
        var name = match[1];
        if (name in self.labels) {
          this.errors += 'Label "' + name + '" redefined on line ' + line_number + "\n";
        }
        self.labels[name] = counter;
        return;
      }

      if (token in OPERATIONS) {
        push_instruction(new Operator(token));
        return;
      }

      var value = parseInt(token);
      if (!isNaN(value)) {
        push_instruction(new Value(value));
        return;
      }

      if (token.match(/^\w+$/)) {
        push_instruction(new Variable(token));
      } else {
        self.errors += 'Unknown token "' + token + '" on line ' + line_number + "\n";
      }
    }

    var lines = source.split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      line_number = i + 1;
      var tokens = lines[i].replace(/#.*$/, '').split(/\s+/);

      for (var j = 0; j < tokens.length; j++) {
        var token = tokens[j].toUpperCase();
        if (token == '') continue;

        var match = token.match(/(\w+)'$/);
        if (match) {
          parse_token(match[1])
          parse_token('RECALL')
        } else {
          parse_token(token);
        }
      }
    }
  },

});

var Robot = Class.extend({

  init: function(name, program) {
    this.name = name;
    this.vm = new VirtualMachine(program, 10);
  },

});

var VirtualMachine = Class.extend({

  init: function(program, speed) {
    this.program = program;
    this.speed = speed;
    this.running = true;

    this.registers = {};
    this.vector = [];
    this.stack = [];
    this.ptr = 0;

    this.max_energy = 50;
    this.energy = 50;
    this.armor = 150;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.chronons = 0;
  },

  step: function() {
    this.chronons++;
    for (var i = this.speed; i > 0 && this.running; ) {
      try {
        i -= this.step_one();
      } catch (e) {
        var line = this.program.instruction_lines[this.ptr];
        var debug = this.program.instructions[this.ptr];
        console.error('Robot error on line ' + line + ' near ' + debug + ' - ' + e);
        this.running = false;
      }
    }
  },

  step_one: function() {
    var instruction = this.program.instructions[this.ptr];
    if (instruction == undefined) {
      throw new Error('Program finished');
    }
    console.log(instruction.toString());

    this.ptr++;

    if (instruction instanceof Variable) {
      this.stack.push(instruction);
      return 1;
    } else if (instruction instanceof Value) {
      var value = instruction.value || 0;
      this.stack.push(value);
      return 1;
    } else if (instruction instanceof Operator) {
      return this.handle_operation(instruction);
    }
  },

  push: function(value) {
    console.log('   -> push: ', value);
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

  set_variable: function(name, value) {
    switch (name) {
      default:
        this.registers[name] = value;
    };
  },

  get_variable: function(name) {
    if (name in this.registers) {
      return this.registers[name];
    }
    if (name in this.program.labels) {
      return this.program.labels[name];
    }
    throw new Error('Unknown variable or label: "' + name + '"');
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

  op_jump: function(new_ptr) {
    this.ptr = new_ptr;
    return 1;
  },

  op_call: function(new_ptr) {
    var return_addr = this.ptr;
    this.ptr = new_ptr;
    this.push(return_addr);
    return 1;
  },

  handle_operation: function(op) {
    var s = this.stack;

    switch (op.name) {
      case '+': return this.op_apply2(function(a, b) { return a + b });
      case '-': return this.op_apply2(function(a, b) { return a - b });
      case '*': return this.op_apply2(function(a, b) { return a * b });
      case '/': return this.op_apply2(function(a, b) { return a / b });
      case '=': return this.op_apply2(function(a, b) { return a == b ? 1 : 0 });
      case '!': return this.op_apply2(function(a, b) { return a != b ? 1 : 0 });
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
        var index = this.pop_variable_value();
        var value = this.pop_variable_value();
        this.vector[index] = value;
        return 1;
      case 'VRECALL':
        var index = this.pop_variable_value();
        var value = this.vector[index] || 0;
        this.push((value < 0 || value > 100) ? 0 : value);
        return 1;


      case 'IF':
        var first = this.pop_variable_value();
        var second = this.pop_number();
        if (second) {
          return this.op_call(second);
        }
        return 1;
      case 'IFE':
        var first = this.pop_variable_value();
        var second = this.pop_variable_value();
        var third = this.pop_number();
        if (third) {
          return this.op_call(second);
        } else {
          return this.op_call(first);
        }
      case 'IFG':
        var first = this.pop_variable_value();
        var second = this.pop_number();
        if (second) {
          return this.op_call(second);
        }
        return 1;
      case 'IFEG':
        var first = this.pop_variable_value();
        var second = this.pop_variable_value();
        var third = this.pop_number();
        if (third) {
          return this.op_call(second);
        } else {
          return this.op_call(first);
        }

      case 'CALL':
        return op_call(this.pop_number());
      case 'JUMP':
      case 'RETURN':
        return this.op_jump(this.pop_number());

      case 'NOP':
        return 1;
      case 'SYNC':
        return Number.MAX_VALUE;
      case 'DROP':
        this.stack.pop();
        return 1;
      case 'DROPALL':
        this.stack = [];
        return 1;
      case 'SWAP':
        var first = this.pop_variable_value();
        var second = this.pop_variable_value();
        this.push(first);
        this.push(second);
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
        console.log('Skipping', op.toString());
        return 1;
    }
  },

});
