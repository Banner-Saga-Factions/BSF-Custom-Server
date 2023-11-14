export const PartiesQueries = {
  GetUserPartyByUserId: 
  `
  SELECT 
    *
  FROM db.Parties
  WHERE
    user_fk = ?;
  `,

  InsertUserParty: 
  `
  INSERT INTO db.Parties
    (user_fk, unit_id)
  VALUES
    (?, ?);
  `,

  DeleteUserParty: 
  `
  DELETE FROM db.Parties
  WHERE
    user_fk = ?
  `,
};