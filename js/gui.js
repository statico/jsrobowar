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

$(document).ready(function() {

  // Navigation tabs ---------------------------------------------------------

  var current_section;

  function set_section(name) {
    $('nav').attr('class', name);
    $('section#' + name).show();
    $('section#' + current_section).hide();
    current_section = name;
  };

  $('#container > section').hide();
  set_section(document.location.hash.replace(/\W/g, '') || 'arena');

  $('nav li a').click(function() {
    var name = $(this).attr('href').substr(1);
    set_section(name);
    document.location.hash = name;
    window.scroll(0, 0);
    return false;
  });

  // Robot choices -----------------------------------------------------------

  var ROBOT_SLOTS = 4;
  var ROBOT_CHOICES = [
    ['Tutorial robots', [
      ['corner-hopper', 'Corner Hopper'],
      ['dgt-with-probes', 'Defensive Gun Turret'],
      ['shape-changer', 'Shape Changer'],
      ['stationary', 'Stationary Bot'],
      ['wall-hugger', 'Wall-Hugger'],
      ['wall-seeker', 'Wall-Seeker'],
      ['wanderer', 'Wanderer'],
    ]],
    ['Mortal class', [
      ['arachnee', 'Arachnee'],
      ['archivist', 'Archivist'],
      ['existentialist', 'Existentialist'],
      ['ghost', 'Ghost'],
      ['invisible-stalker', 'Invisible Stalker'],
      ['locke', 'Lock v18'],
      ['pearl', 'Pearl'],
      ['silo-iv', 'Silo IV'],
      ['timbot-iv', 'Timbot IV'],
    ]],
    ['Titan class', [
      ['dark-knight-4', 'Dark Knight 4'],
      ['fluffy-3', 'Fluffy 3'],
      ['soul-deliverer-9x', 'Soul Deliverer 9x'],
      ['the-dead-parrot', 'The Dead Parrot'],
      ['zim', 'Zim'],
    ]],
  ];

  for (var i = 0; i < ROBOT_SLOTS; i++) {
    var select = $('<select/>').attr('id', 'choice' + i);
    select.append($('<option/>').text('Choose a robot...'));
    for (var j = 0, group; group = ROBOT_CHOICES[j]; j++) {
      var optgroup = $('<optgroup/>').attr('label', group[0]);
      for (var k = 0, choice; choice = group[1][k]; k++) {
        optgroup.append($('<option/>').attr('value', choice[0]).text(choice[1]));
      }
      select.append(optgroup);
    }

    var edit = $('<a/>').text('Edit...').attr('href', '#');

    $('#choices ol').append($('<li/>').append(select).append(edit));
  }

});

/*
  var game = undefined; // Really? I have to set this as undefined? C'mon...
  var bot1 = 'arachnee';
  var bot2 = 'zim';

  $(document).ready(function() {

    $('#play').click(function() {
      $(this).text('Restart');

      if (game) {
        game.stop();
        $('#arena').add('#scoreboard').children().remove();
      }
      game = new Game($('#arena')[0], $('#scoreboard')[0]);

      var program1 = new Program();
      program1.parse($('#code1').val());

      var program2 = new Program();
      program2.parse($('#code2').val());

      if (program1.errors || program2.errors) {
        $('#errors1').val(program1.errors);
        $('#errors2').val(program2.errors);
        return;
      }

      var r1 = new Robot(bot1, $('#color1').val(), program1);
      r1.max_energy = 60;
      r1.starting_damage = 150;
      r1.max_shield = 0;
      r1.speed = 30;
      r1.bullet_type = 'EXPLOSIVE';
      //r1.set_trace(true);
      game.add_robot(r1);

      var r2 = new Robot(bot2, $('#color2').val(), program2);
      r2.max_energy = 100;
      r2.starting_damage = 150;
      r2.max_shield = 25;
      r2.speed = 15;
      r2.bullet_type = 'RUBBER';
      //r2.set_trace(true);
      game.add_robot(r2);

      //game.start();
    });

    $('#stop').click(function() {
      if (game) game.stop();
    });

    $('#code1').load('robots/' + bot1 + '.txt', function() {
    $('#code2').load('robots/' + bot2 + '.txt', function() {
    $('#play').click(); //XXX
    });
    });

  });
);
 */
