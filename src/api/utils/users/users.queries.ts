export const UsersQueries = {
    GetUsers: 
    `
    SELECT 
      *
    FROM db.Users as u
    `,
  
    GetUserById: 
    `
    SELECT 
      *
    FROM db.Users as u
    WHERE
      id = ?
    `,

    UpdateUserLoginCount: 
    `
    UPDATE db.Users as u
      SET u.login_count = u.login_count + 1
    WHERE
      id = ?
    `
    ,

    UpdateUserRenown: 
    `
    UPDATE db.Users as u
      SET u.renown = u.renown - ?
    WHERE
      id = ?
    `
    ,

    ExpandUserBarracks: 
    `
    UPDATE db.Users as u
      SET u.roster_rows = u.roster_rows + 1, u.renown = u.renown - 60
    WHERE
      id = ?
    `
  };