export const UsersQueries = {
    GetUsers: `
    SELECT 
      *
    FROM banner_saga_factions.users as u
    `,
  
    GetUserById: `
    SELECT 
      *
    FROM banner_saga_factions.users as u
    WHERE
      id = ?
    `,

    GetUserPartyById: `
    SELECT 
      *
    FROM banner_saga_factions.parties as p
    WHERE
      user_fk = ?;
    `,

    GetUserRostersById: `
    SELECT 
      r.id as roster_id, class, unit_id as id, entity_class, name, start_date, appearance_acquires, appearance_index
    FROM banner_saga_factions.rosters as r
    LEFT JOIN banner_saga_factions.classes c ON r.class_fk = c.id
    WHERE
      user_fk = ?;
    `,

    GetUserPartyRostersByUserId: `
    SELECT 
      r.id,
        r.user_fk,
        c.class,
        r.unit_id,
        r.entity_class,
        r.name,
        r.appearance_acquires,
        r.appearance_index
    FROM banner_saga_factions.parties p
    LEFT JOIN banner_saga_factions.rosters r ON p.unit_id = r.unit_id
    LEFT JOIN banner_saga_factions.classes c ON r.class_fk = c.id
    WHERE p.user_fk = ? AND r.user_fk = ?;
    `,

    GetUserRosterStatsByRosterId: `
    SELECT 
      class, stat, value
    FROM banner_saga_factions.roster_stats as rs
    LEFT JOIN banner_saga_factions.classes c ON rs.class_fk = c.id
    LEFT JOIN banner_saga_factions.stats s ON rs.stat_fk = s.id
    WHERE
      roster_fk = ?
    ORDER BY stat_fk ASC;
    `,

    GetUserRosterStat: `
    SELECT 
      *
    FROM banner_saga_factions.roster_stats
    WHERE 
      roster_fk = ?
    AND stat_fk = ?;
    `,

    GetUnitByUserIdAndUnitId: `
    SELECT 
      *
    FROM banner_saga_factions.rosters as r
    WHERE
      r.user_fk = ? and r.unit_id = ?;
    `,

    InsertUserParty: `
    INSERT INTO banner_saga_factions.parties
    (user_fk, unit_id)
    VALUES
    (?, ?);
    `
    ,

    UpdateUserLoginCount: `
    UPDATE banner_saga_factions.users as u
    SET u.login_count = u.login_count + 1
    WHERE
      id = ?
    `
    ,

    UpdateUserRenown: `
    UPDATE banner_saga_factions.users as u
    SET u.renown = u.renown - ?
    WHERE
      id = ?
    `
    ,

    UpdateRosterStat_Rank: `
    UPDATE banner_saga_factions.roster_stats as rs
    SET rs.value = rs.value + 1
    WHERE
      roster_fk = ?
    AND stat_fk = 1;
    `
    ,

    UpdateRosterStat: `
    UPDATE banner_saga_factions.roster_stats as rs
    SET rs.value = rs.value + ?
    WHERE
      roster_fk = ?
    AND stat_fk = ?;
    `
    ,

    UpdateRoster_Name: `
    UPDATE banner_saga_factions.rosters as r
    SET r.name = ?
    WHERE
      user_fk = ?
    AND unit_id = ?;
    `
    ,

    UpdateRoster_EntityClass: `
    UPDATE banner_saga_factions.rosters as r
    SET r.entity_class = ?
    WHERE
      user_fk = ?
    AND unit_id = ?;
    `
    ,

    ExpandUserBarracks: `
    UPDATE banner_saga_factions.users as u
    SET u.roster_rows = u.roster_rows + 1, u.renown = u.renown - 60
    WHERE
      id = ?
    `
    ,

    DeleteUserParty: `
    DELETE FROM banner_saga_factions.parties
    WHERE
      user_fk = ?
    `
    ,

    DeleteUserRosterUnit: `
    DELETE FROM banner_saga_factions.rosters
    WHERE
      user_fk = ? 
    AND 
      unit_id = ?
    `
    ,

    DeleteUserRosterStats: `
    DELETE FROM banner_saga_factions.roster_stats
    WHERE roster_fk = (SELECT id FROM banner_saga_factions.rosters WHERE user_fk = ? AND unit_id = ?)
    `
  };