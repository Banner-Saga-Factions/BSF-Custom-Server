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
    `
  };