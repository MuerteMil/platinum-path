'use strict';
// Real IPlayerService/GetGameAchievements responses (Steam, 25 Nov 2026, language=english),
// trimmed to a few achievements per set. Fields and values are exactly as Steam sent them.

const ach = (internal_name, localized_name, groupid, extra = {}) => ({
  internal_name, localized_name, localized_desc: '', icon: `${internal_name}.jpg`, icon_gray: `${internal_name}_BW.jpg`,
  hidden: false, player_percent_unlocked: '10.0', internal_key: 1, groupid, archived: false, progress_type: 0, ...extra
});
const group = (groupid, localized_name, extra = {}) => ({
  groupid, localized_name, dlcappid: 0, archived: false, developeronly: false, order: 0, ispublic: true,
  total_achievements: 0, completion_achievements: 0, ...extra
});

// Portal 2: two base-game sets; the implicit base set (0) is empty and "Cooperative" has order 1.
const portal2 = { response: {
  achievements: [
    ach('ACH.SURVIVE_CONTAINER_RIDE', 'Wake Up Call', 2, { player_percent_unlocked: '74.0' }),
    ach('ACH.WAKE_UP', 'You Monster', 2, { player_percent_unlocked: '64.7' }),
    ach('ACH.BREAK_MONITORS', 'Smash TV', 2, { player_percent_unlocked: '3.7' }),
    ach('ACH.HI_FIVE_YOUR_PARTNER', 'High Five', 1, { player_percent_unlocked: '58.5' }),
    ach('ACH.STAYING_ALIVE', 'Still Alive', 1, { player_percent_unlocked: '2.4' })
  ],
  schema_version: 1108170007,
  groups: [
    group(0, '', { total_achievements: 0, completion_achievements: 0 }),
    group(1, 'Cooperative', { order: 1, total_achievements: 22, completion_achievements: 22 }),
    group(2, 'Single Player', { total_achievements: 29, completion_achievements: 29 })
  ],
  schema_hash: 3207947195
} };

// Team Fortress 2: "Replay" has 8 achievements, 4 of them archived (YouTube views).
const tf2 = { response: {
  achievements: [
    ach('TF_PLAY_GAME_EVERYCLASS', 'Head of the Class', 0, { player_percent_unlocked: '12.9' }),
    ach('TF_REPLAY_SAVE_REPLAY', "That's a Wrap", 11, { player_percent_unlocked: '11.6' }),
    ach('TF_REPLAY_YOUTUBE_VIEWS_TIER1', 'Home Movie', 11, { archived: true, player_percent_unlocked: '8.0', progress_type: 1, min_progress_int: 0, max_progress_int: 100 }),
    ach('TF_REPLAY_YOUTUBE_VIEWS_HIGHEST', 'Blockbuster', 11, { archived: true, player_percent_unlocked: '5.9', progress_type: 1, min_progress_int: 0, max_progress_int: 100000 }),
    ach('TF_CHRISTMAS_COLLECT_GIFTS', 'Gift Grab', 12, { player_percent_unlocked: '14.0' })
  ],
  schema_version: 383,
  groups: [
    group(0, '', { total_achievements: 47, completion_achievements: 47 }),
    group(11, 'Replay', { total_achievements: 8, completion_achievements: 4 }),
    group(12, 'Christmas', { total_achievements: 1, completion_achievements: 1 })
  ],
  schema_hash: 479305813
} };

// Euro Truck Simulator 2: DLC sets carry the DLC's app id.
const ets2 = { response: {
  achievements: [
    ach('use_train', 'Choo-Choo', 0, { player_percent_unlocked: '45.0' }),
    ach('map_discover_100', 'Pathfinder', 0, { player_percent_unlocked: '5.3' }),
    ach('gr_visit_cities', 'Odyssean Voyager', 1, { player_percent_unlocked: '25.5' }),
    ach('st_first_cargo', 'Size Matters', 2, { player_percent_unlocked: '75.7' }),
    ach('aca_first', "Get the Ball Rollin'", 12, { player_percent_unlocked: '8.3' })
  ],
  schema_version: 133,
  groups: [
    group(0, '', { total_achievements: 29, completion_achievements: 29 }),
    group(1, 'Greece Map Expansion Achievements', { dlcappid: 2604420, total_achievements: 5, completion_achievements: 5 }),
    group(2, 'Special Transport Expansion Achievements', { dlcappid: 558245, total_achievements: 8, completion_achievements: 8 }),
    group(12, 'Driving Academy Achievements', { total_achievements: 10, completion_achievements: 10 })
  ],
  schema_hash: 3529575084
} };

module.exports = { portal2, tf2, ets2 };
