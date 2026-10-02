/* The fighter pool. The array index is stored in match codes, so only ever append to this list. */
(function (root) {
  'use strict';

  // style: how the fighter attacks. melee = dashes in, beam = fires a projectile, magic = casts an orb.
  var FIGHTERS = [
    { id: 'lich',     name: 'The Lych Kinge',     from: 'Lord of the Frozen Thrown',      special: 'Frostmourning Cleave',  style: 'melee', fx: '#7af0ff' },
    { id: 'skull',    name: 'Skullator',          from: 'Overlord of Snake Mountin',      special: 'Ram Staff Hex',         style: 'magic', fx: '#c060ff' },
    { id: 'leo',      name: 'Leo-Oh',             from: 'Lord of the ThunderKats',        special: 'Sword of Ominous',      style: 'melee', fx: '#9af0ff' },
    { id: 'heman',    name: 'He-Manly',           from: 'Most Powerful Man in the Cosmoz', special: 'By the Power of Greyskul!', style: 'melee', fx: '#ffe060' },
    { id: 'mumm',     name: 'Mumm-Rah',           from: 'The Ever-Living (Mostly)',       special: 'Ancient Spirits of Meh', style: 'magic', fx: '#ff3048' },
    { id: 'mario',    name: 'Super Mardio',       from: 'Plumber of the Mushroom Kingdumb', special: 'Fire Flower Fling',   style: 'beam',  fx: '#ff8a20' },
    { id: 'browser',  name: 'King Browser',       from: 'Koopa Kommander-in-Chief',       special: 'Shell Spin Inferno',    style: 'beam',  fx: '#ff5a28' },
    { id: 'sonik',    name: 'Sonik the Hedgefox', from: 'Gotta Go Moderately Fast',       special: 'Spin Dash Overdrive',   style: 'melee', fx: '#4a8aff' },
    { id: 'pak',      name: 'Pak-Muncher',        from: 'Maze Gobbler Supreme',           special: 'Power Pellet Chomp',    style: 'melee', fx: '#ffe020' },
    { id: 'lenk',     name: 'Lenk of Hyrool',     from: 'Hero of Thyme',                  special: 'Master Sword Beam',     style: 'beam',  fx: '#a8f0ff' },
    { id: 'mega',     name: 'Mega Dude',          from: 'Blue Bomber, Model DLN-1ish',    special: 'Charged Buster Shot',   style: 'beam',  fx: '#70e8ff' },
    { id: 'optimal',  name: 'Optimal Prime',      from: 'Leader of the Autobotz',         special: 'Roll Out Rampage',      style: 'melee', fx: '#ff4040' },
    { id: 'shreddor', name: 'The Shreddor',       from: 'Master of the Foot Klan',        special: 'Bladed Gauntlet Barrage', style: 'melee', fx: '#c060ff' },
    { id: 'turtle',   name: 'Leonardough',        from: 'Teenage Mutant Ninja Terrapin',  special: 'Cowabunga Katana',      style: 'melee', fx: '#5cc040' },
    { id: 'ryo',      name: 'Ryo',                from: 'Wandering Street Brawler',       special: 'Hadooken!',             style: 'beam',  fx: '#60a0ff' },
    { id: 'scorpyon', name: 'Scorpyon',           from: 'Spectre of the Netherrealm',     special: 'Get Over Hear!',        style: 'beam',  fx: '#ffb020' },
    { id: 'samos',    name: 'Samos Arran',        from: 'Galactic Bounty Huntress',       special: 'Charge Beam Blast',     style: 'beam',  fx: '#50f070' },
    { id: 'kongo',    name: 'Dinky Kongo',        from: 'Jungle Barrel Champion',         special: 'Barrel Bonanza',        style: 'melee', fx: '#e8b080' },
    { id: 'kobra',    name: 'Kobra Kommander',    from: 'Supreme Leader of K.O.B.R.A.',   special: 'Venom Commandment',     style: 'magic', fx: '#60ff80' },
    { id: 'robutnik', name: 'Dr. Robutnik',       from: 'Evil Genius, Egg Enthusiast',    special: 'Egg-o-matic Wrecking Ball', style: 'magic', fx: '#ffd840' }
  ];

  var api = { FIGHTERS: FIGHTERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.DM2 = root.DM2 || {}; root.DM2.roster = api; }
})(this);
